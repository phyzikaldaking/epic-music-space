"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CityBuilding } from "@/app/api/city/data/route";

// ─── Types ───────────────────────────────────────────────────────────────────
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  name: string;
  level: number;
  avgScore: number;
  district: string;
  username: string;
}

interface Props {
  buildings: CityBuilding[];
}

// ─── District config ─────────────────────────────────────────────────────────
const DISTRICT_CONFIG = {
  LABEL_ROW: {
    label: "👑 Label Row",
    color: { r: 1, g: 0.84, b: 0 }, // gold
    emissive: { r: 0.4, g: 0.28, b: 0 },
    platformColor: { r: 0.15, g: 0.12, b: 0.02 },
    lightColor: { r: 1, g: 0.84, b: 0 },
    center: { x: 0, z: -20 },
  },
  DOWNTOWN_PRIME: {
    label: "🏙️ Downtown Prime",
    color: { r: 0.42, g: 0.36, b: 0.9 }, // brand purple
    emissive: { r: 0.15, g: 0.12, b: 0.35 },
    platformColor: { r: 0.08, g: 0.06, b: 0.2 },
    lightColor: { r: 0.42, g: 0.36, b: 0.9 },
    center: { x: -22, z: 14 },
  },
  INDIE_BLOCKS: {
    label: "🔮 Indie Blocks",
    color: { r: 0, g: 0.96, b: 1 }, // accent cyan
    emissive: { r: 0, g: 0.18, b: 0.22 },
    platformColor: { r: 0.03, g: 0.1, b: 0.12 },
    lightColor: { r: 0, g: 0.96, b: 1 },
    center: { x: 22, z: 14 },
  },
} as const;

// ─── Component ───────────────────────────────────────────────────────────────
export default function CityScene3D({ buildings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    name: "",
    level: 0,
    avgScore: 0,
    district: "",
    username: "",
  });
  const tooltipElRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const updateTooltipDOM = useCallback((state: TooltipState) => {
    const el = tooltipElRef.current;
    if (!el) return;
    if (!state.visible) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = `${state.x + 14}px`;
    el.style.top = `${state.y - 14}px`;
    const nameEl = el.querySelector<HTMLSpanElement>("[data-tip-name]");
    const distEl = el.querySelector<HTMLSpanElement>("[data-tip-district]");
    const lvlEl = el.querySelector<HTMLSpanElement>("[data-tip-level]");
    const scoreEl = el.querySelector<HTMLSpanElement>("[data-tip-score]");
    if (nameEl) nameEl.textContent = state.name;
    if (distEl) distEl.textContent = state.district;
    if (lvlEl) lvlEl.textContent = `Lv. ${state.level}`;
    if (scoreEl) scoreEl.textContent = `Score ${state.avgScore.toFixed(1)}`;
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    let engine: import("@babylonjs/core").Engine | undefined;

    async function initScene() {
      const {
        Engine,
        Scene,
        ArcRotateCamera,
        Vector3,
        HemisphericLight,
        PointLight,
        MeshBuilder,
        StandardMaterial,
        Color3,
        Color4,
        ActionManager,
        ExecuteCodeAction,
        ParticleSystem,
        Texture,
        DefaultRenderingPipeline,
        GlowLayer,
      } = await import("@babylonjs/core");

      const engineInstance = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true,
      });
      engine = engineInstance;

      const scene = new Scene(engineInstance);
      scene.clearColor = new Color4(0.04, 0.04, 0.06, 1);

      // ── Volumetric fog for depth ──────────────────────────────────────────
      scene.fogMode = Scene.FOGMODE_EXP2;
      scene.fogDensity = 0.008;
      scene.fogColor = new Color3(0.04, 0.04, 0.08);

      // ── Glow layer for neon bloom ─────────────────────────────────────────
      const glowLayer = new GlowLayer("glow", scene, {
        blurKernelSize: 64,
        mainTextureFixedSize: 512,
      });
      glowLayer.intensity = 0.8;

      // ── Camera ──────────────────────────────────────────────────────────
      const camera = new ArcRotateCamera(
        "cam",
        -Math.PI / 2,
        Math.PI / 3.5,
        75,
        Vector3.Zero(),
        scene,
      );
      camera.lowerRadiusLimit = 20;
      camera.upperRadiusLimit = 140;
      camera.lowerBetaLimit = 0.3;
      camera.upperBetaLimit = Math.PI / 2.1;
      camera.attachControl(canvas, true);
      camera.wheelPrecision = 3;
      camera.pinchPrecision = 50;
      camera.useAutoRotationBehavior = true;
      const autoRotation = camera.autoRotationBehavior;
      if (autoRotation) {
        autoRotation.idleRotationSpeed = 0.08;
        autoRotation.idleRotationWaitTime = 3000;
        autoRotation.idleRotationSpinupTime = 1500;
        autoRotation.zoomStopsAnimation = true;
      }

      // ── Post-processing pipeline ─────────────────────────────────────────
      const pipeline = new DefaultRenderingPipeline("pipeline", true, scene, [
        camera,
      ]);
      pipeline.bloomEnabled = true;
      pipeline.bloomThreshold = 0.3;
      pipeline.bloomWeight = 0.6;
      pipeline.bloomKernel = 64;
      pipeline.bloomScale = 0.5;
      pipeline.chromaticAberrationEnabled = true;
      pipeline.chromaticAberration.aberrationAmount = 15;
      pipeline.grainEnabled = true;
      pipeline.grain.intensity = 8;
      pipeline.grain.animated = true;

      // ── Ambient light ────────────────────────────────────────────────────
      const ambient = new HemisphericLight(
        "ambient",
        new Vector3(0, 1, 0),
        scene,
      );
      ambient.intensity = 0.25;
      ambient.diffuse = new Color3(0.5, 0.5, 0.9);
      ambient.groundColor = new Color3(0.05, 0.05, 0.1);

      // ── Ground grid ──────────────────────────────────────────────────────
      const ground = MeshBuilder.CreateGround(
        "ground",
        { width: 120, height: 120, subdivisions: 30 },
        scene,
      );
      const groundMat = new StandardMaterial("groundMat", scene);
      groundMat.diffuseColor = new Color3(0.06, 0.06, 0.1);
      groundMat.emissiveColor = new Color3(0.03, 0.03, 0.06);
      groundMat.wireframe = true;
      ground.material = groundMat;
      ground.position.y = -0.5;

      // ── Grid lines overlay ───────────────────────────────────────────────
      const gridOverlay = MeshBuilder.CreateGround(
        "gridOverlay",
        { width: 120, height: 120 },
        scene,
      );
      const gridMat = new StandardMaterial("gridMat", scene);
      gridMat.diffuseColor = new Color3(0.08, 0.08, 0.15);
      gridMat.alpha = 0.4;
      gridOverlay.material = gridMat;
      gridOverlay.position.y = -0.48;

      // ── District platforms ───────────────────────────────────────────────
      const districtKeys = [
        "LABEL_ROW",
        "DOWNTOWN_PRIME",
        "INDIE_BLOCKS",
      ] as const;

      for (const dk of districtKeys) {
        const cfg = DISTRICT_CONFIG[dk];

        // Platform slab
        const platform = MeshBuilder.CreateBox(
          `platform_${dk}`,
          { width: 24, depth: 24, height: 0.4 },
          scene,
        );
        platform.position.set(cfg.center.x, -0.3, cfg.center.z);

        const platMat = new StandardMaterial(`platMat_${dk}`, scene);
        platMat.diffuseColor = new Color3(
          cfg.platformColor.r,
          cfg.platformColor.g,
          cfg.platformColor.b,
        );
        platMat.emissiveColor = new Color3(
          cfg.emissive.r * 0.5,
          cfg.emissive.g * 0.5,
          cfg.emissive.b * 0.5,
        );
        platform.material = platMat;

        // Glowing border ring
        const ring = MeshBuilder.CreateTorus(
          `ring_${dk}`,
          { diameter: 26, thickness: 0.18, tessellation: 64 },
          scene,
        );
        ring.position.set(cfg.center.x, -0.1, cfg.center.z);
        ring.rotation.x = Math.PI / 2;
        const ringMat = new StandardMaterial(`ringMat_${dk}`, scene);
        ringMat.emissiveColor = new Color3(
          cfg.color.r,
          cfg.color.g,
          cfg.color.b,
        );
        ring.material = ringMat;

        // District glow light
        const light = new PointLight(
          `light_${dk}`,
          new Vector3(cfg.center.x, 8, cfg.center.z),
          scene,
        );
        light.diffuse = new Color3(
          cfg.lightColor.r,
          cfg.lightColor.g,
          cfg.lightColor.b,
        );
        light.specular = new Color3(
          cfg.lightColor.r,
          cfg.lightColor.g,
          cfg.lightColor.b,
        );
        light.intensity = 1.2;
        light.range = 45;
      }

      // ── Building meshes ──────────────────────────────────────────────────
      // Group buildings by district and lay them out in a grid
      const byDistrict: Record<string, CityBuilding[]> = {
        LABEL_ROW: [],
        DOWNTOWN_PRIME: [],
        INDIE_BLOCKS: [],
      };
      for (const b of buildings) {
        (byDistrict[b.district] ?? byDistrict.INDIE_BLOCKS).push(b);
      }

      // Map district → username → mesh for pointer tracking
      const buildingMeshMap = new Map<string, string>(); // meshId → username
      const usernameMap = new Map<string, CityBuilding>(); // username → building data

      for (const b of buildings) {
        usernameMap.set(b.username, b);
      }

      for (const dk of districtKeys) {
        const cfg = DISTRICT_CONFIG[dk];
        const list = byDistrict[dk].slice(0, 16);
        const cols = 4;

        list.forEach((b, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const spacing = 5.5;
          const offX = (col - (cols - 1) / 2) * spacing;
          const offZ = (row - Math.floor(list.length / cols / 2)) * spacing;

          // Height = 1..14 based on level + score
          const height = Math.max(
            1.2,
            Math.min(14, b.level * 1.2 + b.avgScore * 0.08),
          );
          const width = 2.0 + b.level * 0.15;

          const box = MeshBuilder.CreateBox(
            `building_${b.username}`,
            { width, depth: width, height },
            scene,
          );
          box.position.set(
            cfg.center.x + offX,
            height / 2,
            cfg.center.z + offZ,
          );

          const mat = new StandardMaterial(`buildingMat_${b.username}`, scene);
          mat.diffuseColor = new Color3(
            cfg.color.r * 0.6,
            cfg.color.g * 0.6,
            cfg.color.b * 0.6,
          );
          mat.emissiveColor = new Color3(
            cfg.emissive.r,
            cfg.emissive.g,
            cfg.emissive.b,
          );
          mat.specularColor = new Color3(
            cfg.color.r * 0.4,
            cfg.color.g * 0.4,
            cfg.color.b * 0.4,
          );
          box.material = mat;

          // Edge rendering for cyberpunk outline
          box.enableEdgesRendering();
          box.edgesWidth = 2.5;
          box.edgesColor = new Color4(
            cfg.color.r,
            cfg.color.g,
            cfg.color.b,
            0.6,
          );

          // Roof neon cap
          const cap = MeshBuilder.CreateBox(
            `cap_${b.username}`,
            { width: width + 0.1, depth: width + 0.1, height: 0.18 },
            scene,
          );
          cap.position.set(
            cfg.center.x + offX,
            height + 0.09,
            cfg.center.z + offZ,
          );
          const capMat = new StandardMaterial(`capMat_${b.username}`, scene);
          capMat.emissiveColor = new Color3(
            cfg.color.r,
            cfg.color.g,
            cfg.color.b,
          );
          cap.material = capMat;

          buildingMeshMap.set(`building_${b.username}`, b.username);

          // ── Interactions ─────────────────────────────────────────────────
          box.actionManager = new ActionManager(scene);

          box.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, (evt) => {
              const building = usernameMap.get(b.username);
              if (!building) return;
              const meshPos = box.getAbsolutePosition();
              // Project to screen
              const screenPos = Vector3.Project(
                meshPos,
                scene.getTransformMatrix(),
                scene.getTransformMatrix(),
                camera.viewport.toGlobal(
                  engineInstance.getRenderWidth(),
                  engineInstance.getRenderHeight(),
                ),
              );
              tooltipRef.current = {
                visible: true,
                x: screenPos.x,
                y: screenPos.y,
                name: building.name,
                level: building.level,
                avgScore: building.avgScore,
                district: DISTRICT_CONFIG[building.district].label,
                username: building.username,
              };
              updateTooltipDOM(tooltipRef.current);

              // Highlight: brighten emissive
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (box.material as any).emissiveColor = new Color3(
                cfg.color.r * 0.45,
                cfg.color.g * 0.45,
                cfg.color.b * 0.45,
              );
            }),
          );

          box.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
              tooltipRef.current = { ...tooltipRef.current, visible: false };
              updateTooltipDOM(tooltipRef.current);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (box.material as any).emissiveColor = new Color3(
                cfg.emissive.r,
                cfg.emissive.g,
                cfg.emissive.b,
              );
            }),
          );

          box.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
              router.push(`/studio/${b.username}`);
            }),
          );
        });
      }

      // ── Star field particles ─────────────────────────────────────────────
      const stars = new ParticleSystem("stars", 800, scene);
      stars.particleTexture = new Texture(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAH0lEQVQI12NkYGD4z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg==",
        scene,
      );
      stars.emitter = new Vector3(0, 0, 0);
      stars.minEmitBox = new Vector3(-80, 30, -80);
      stars.maxEmitBox = new Vector3(80, 80, 80);
      stars.color1 = new Color4(1, 1, 1, 0.9);
      stars.color2 = new Color4(0.7, 0.7, 1, 0.6);
      stars.colorDead = new Color4(0, 0, 0, 0);
      stars.minSize = 0.08;
      stars.maxSize = 0.22;
      stars.minLifeTime = 8;
      stars.maxLifeTime = 12;
      stars.emitRate = 80;
      stars.blendMode = ParticleSystem.BLENDMODE_ONEONE;
      stars.gravity = new Vector3(0, -0.01, 0);
      stars.direction1 = new Vector3(-0.05, -0.02, -0.05);
      stars.direction2 = new Vector3(0.05, 0.02, 0.05);
      stars.minAngularSpeed = 0;
      stars.maxAngularSpeed = 0.1;
      stars.minEmitPower = 0.05;
      stars.maxEmitPower = 0.15;
      stars.updateSpeed = 0.012;
      stars.start();

      // ── Floating glow orbs (ambient atmosphere) ──────────────────────────
      const ORB_DATA = [
        {
          pos: new Vector3(-22, 12, 14),
          color: new Color4(0.42, 0.36, 0.9, 0.6),
          dk: "DOWNTOWN_PRIME",
        },
        {
          pos: new Vector3(0, 16, -20),
          color: new Color4(1, 0.84, 0, 0.6),
          dk: "LABEL_ROW",
        },
        {
          pos: new Vector3(22, 10, 14),
          color: new Color4(0, 0.96, 1, 0.6),
          dk: "INDIE_BLOCKS",
        },
      ];

      for (const orb of ORB_DATA) {
        const orbPs = new ParticleSystem(`orb_${orb.dk}`, 60, scene);
        orbPs.particleTexture = stars.particleTexture;
        orbPs.emitter = orb.pos;
        orbPs.minEmitBox = new Vector3(-1, -1, -1);
        orbPs.maxEmitBox = new Vector3(1, 1, 1);
        orbPs.color1 = orb.color;
        orbPs.color2 = new Color4(
          orb.color.r * 0.5,
          orb.color.g * 0.5,
          orb.color.b * 0.5,
          0.3,
        );
        orbPs.colorDead = new Color4(0, 0, 0, 0);
        orbPs.minSize = 0.3;
        orbPs.maxSize = 0.7;
        orbPs.minLifeTime = 2;
        orbPs.maxLifeTime = 4;
        orbPs.emitRate = 15;
        orbPs.blendMode = ParticleSystem.BLENDMODE_ONEONE;
        orbPs.gravity = new Vector3(0, 0.3, 0);
        orbPs.direction1 = new Vector3(-0.5, 0.5, -0.5);
        orbPs.direction2 = new Vector3(0.5, 1, 0.5);
        orbPs.minEmitPower = 0.1;
        orbPs.maxEmitPower = 0.3;
        orbPs.updateSpeed = 0.015;
        orbPs.start();
      }

      // ── Digital spark trails (GTA 2k vibe) ────────────────────────────────
      const sparkTrails = new ParticleSystem("sparks", 300, scene);
      sparkTrails.particleTexture = stars.particleTexture;
      sparkTrails.emitter = new Vector3(0, 25, 0);
      sparkTrails.minEmitBox = new Vector3(-60, 0, -60);
      sparkTrails.maxEmitBox = new Vector3(60, 0, 60);
      sparkTrails.color1 = new Color4(0.42, 0.36, 0.9, 1);
      sparkTrails.color2 = new Color4(0, 0.96, 1, 1);
      sparkTrails.colorDead = new Color4(0, 0, 0, 0);
      sparkTrails.minSize = 0.05;
      sparkTrails.maxSize = 0.15;
      sparkTrails.minLifeTime = 1.5;
      sparkTrails.maxLifeTime = 3;
      sparkTrails.emitRate = 60;
      sparkTrails.blendMode = ParticleSystem.BLENDMODE_ADD;
      sparkTrails.gravity = new Vector3(0, -15, 0);
      sparkTrails.direction1 = new Vector3(-0.5, -3, -0.5);
      sparkTrails.direction2 = new Vector3(0.5, -5, 0.5);
      sparkTrails.minEmitPower = 1;
      sparkTrails.maxEmitPower = 3;
      sparkTrails.updateSpeed = 0.02;
      sparkTrails.start();

      // ── District scan beams ───────────────────────────────────────────────
      const scanBeam = new ParticleSystem("scanBeam", 100, scene);
      scanBeam.particleTexture = stars.particleTexture;
      scanBeam.emitter = new Vector3(0, 0, 0);
      scanBeam.minEmitBox = new Vector3(-50, 0, -50);
      scanBeam.maxEmitBox = new Vector3(50, 0, 50);
      scanBeam.color1 = new Color4(0.42, 0.36, 0.9, 0.4);
      scanBeam.color2 = new Color4(0, 0.96, 1, 0.3);
      scanBeam.colorDead = new Color4(0, 0, 0, 0);
      scanBeam.minSize = 2;
      scanBeam.maxSize = 8;
      scanBeam.minLifeTime = 2;
      scanBeam.maxLifeTime = 4;
      scanBeam.emitRate = 8;
      scanBeam.blendMode = ParticleSystem.BLENDMODE_ADD;
      scanBeam.gravity = new Vector3(0, 2, 0);
      scanBeam.direction1 = new Vector3(0, 1, 0);
      scanBeam.direction2 = new Vector3(0, 1, 0);
      scanBeam.minEmitPower = 0.5;
      scanBeam.maxEmitPower = 1.5;
      scanBeam.updateSpeed = 0.01;
      scanBeam.start();

      // ── Ambient floating data particles ───────────────────────────────────
      const dataParticles = new ParticleSystem("data", 200, scene);
      dataParticles.particleTexture = stars.particleTexture;
      dataParticles.emitter = new Vector3(0, 15, 0);
      dataParticles.minEmitBox = new Vector3(-70, -5, -70);
      dataParticles.maxEmitBox = new Vector3(70, 25, 70);
      dataParticles.color1 = new Color4(1, 1, 1, 0.15);
      dataParticles.color2 = new Color4(0.5, 0.5, 0.8, 0.1);
      dataParticles.colorDead = new Color4(0, 0, 0, 0);
      dataParticles.minSize = 0.02;
      dataParticles.maxSize = 0.06;
      dataParticles.minLifeTime = 6;
      dataParticles.maxLifeTime = 10;
      dataParticles.emitRate = 25;
      dataParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
      dataParticles.gravity = new Vector3(0, 0.05, 0);
      dataParticles.direction1 = new Vector3(-0.1, 0.1, -0.1);
      dataParticles.direction2 = new Vector3(0.1, 0.2, 0.1);
      dataParticles.minEmitPower = 0.02;
      dataParticles.maxEmitPower = 0.08;
      dataParticles.updateSpeed = 0.008;
      dataParticles.start();

      // ── Render loop ──────────────────────────────────────────────────────
      engineInstance.runRenderLoop(() => {
        scene.render();
      });

      const handleResize = () => engineInstance.resize();
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        stars.dispose();
        sparkTrails.dispose();
        scanBeam.dispose();
        dataParticles.dispose();
        engineInstance.dispose();
      };
    }

    let cleanup: (() => void) | undefined;
    initScene()
      .then((fn) => { cleanup = fn; })
      .catch((err) => {
        // Surface WebGL/Babylon init failures to the ErrorBoundary above
        throw err;
      });

    return () => {
      cleanup?.();
    };
  }, [buildings, router, updateTooltipDOM]);

  return (
    <div className="relative w-full" style={{ height: 520 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block rounded-2xl"
        style={{ touchAction: "none" }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipElRef}
        className="pointer-events-none absolute z-20 hidden rounded-xl border border-white/15 bg-[#101018]/90 px-4 py-3 backdrop-blur-sm shadow-xl"
        style={{ minWidth: 160 }}
      >
        <p className="font-bold text-sm text-white" data-tip-name />
        <p className="text-xs text-white/50 mt-0.5" data-tip-district />
        <div className="flex gap-3 mt-1.5">
          <span
            className="text-xs font-semibold text-brand-400"
            data-tip-level
          />
          <span className="text-xs text-gold-400" data-tip-score />
        </div>
        <p className="text-[10px] text-white/35 mt-1.5">
          Click to open studio →
        </p>
      </div>

      {/* District legend overlay */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5">
        {(
          [
            { dk: "LABEL_ROW", color: "bg-gold-500", text: "text-gold-400" },
            {
              dk: "DOWNTOWN_PRIME",
              color: "bg-brand-500",
              text: "text-brand-400",
            },
            {
              dk: "INDIE_BLOCKS",
              color: "bg-accent-500",
              text: "text-accent-400",
            },
          ] as const
        ).map(({ dk, color, text }) => (
          <div key={dk} className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${color} opacity-80`} />
            <span className={`text-[11px] font-semibold ${text} opacity-80`}>
              {DISTRICT_CONFIG[dk].label}
            </span>
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div className="pointer-events-none absolute bottom-4 right-4 text-[10px] text-white/25 text-right">
        <p>Drag to orbit · Scroll to zoom</p>
        <p>Click building to open studio</p>
      </div>
    </div>
  );
}
