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
    color: { r: 1, g: 0.84, b: 0 },
    emissive: { r: 0.4, g: 0.28, b: 0 },
    platformColor: { r: 0.15, g: 0.12, b: 0.02 },
    lightColor: { r: 1, g: 0.84, b: 0 },
    center: { x: 0, z: -20 },
  },
  DOWNTOWN_PRIME: {
    label: "🏙️ Downtown Prime",
    color: { r: 0.42, g: 0.36, b: 0.9 },
    emissive: { r: 0.15, g: 0.12, b: 0.35 },
    platformColor: { r: 0.08, g: 0.06, b: 0.2 },
    lightColor: { r: 0.42, g: 0.36, b: 0.9 },
    center: { x: -22, z: 14 },
  },
  INDIE_BLOCKS: {
    label: "🔮 Indie Blocks",
    color: { r: 0, g: 0.96, b: 1 },
    emissive: { r: 0, g: 0.18, b: 0.22 },
    platformColor: { r: 0.03, g: 0.1, b: 0.12 },
    lightColor: { r: 0, g: 0.96, b: 1 },
    center: { x: 22, z: 14 },
  },
} as const;

// ─── Seeded deterministic pseudo-random (no Math.random) ─────────────────────
function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

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
        DirectionalLight,
        MeshBuilder,
        StandardMaterial,
        Color3,
        Color4,
        ActionManager,
        ExecuteCodeAction,
        ParticleSystem,
        Texture,
      } = await import("@babylonjs/core");

      const engineInstance = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true,
      });
      engine = engineInstance;

      const scene = new Scene(engineInstance);
      // Deep night-sky background
      scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);

      // ── Atmospheric fog ───────────────────────────────────────────────────
      scene.fogMode = Scene.FOGMODE_LINEAR;
      scene.fogColor = new Color3(0.02, 0.02, 0.07);
      scene.fogStart = 70;
      scene.fogEnd = 150;

      // ── Camera ────────────────────────────────────────────────────────────
      const camera = new ArcRotateCamera(
        "cam",
        -Math.PI / 2,
        Math.PI / 3.2,
        78,
        new Vector3(0, 2, 0),
        scene
      );
      camera.lowerRadiusLimit = 18;
      camera.upperRadiusLimit = 150;
      camera.lowerBetaLimit = 0.22;
      camera.upperBetaLimit = Math.PI / 2.05;
      camera.attachControl(canvas, true);
      camera.wheelPrecision = 3;
      camera.pinchPrecision = 50;

      // ── Lighting: dark night + cool moonlight ─────────────────────────────
      const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
      ambient.intensity = 0.1;
      ambient.diffuse = new Color3(0.22, 0.26, 0.5);
      ambient.groundColor = new Color3(0.02, 0.02, 0.05);

      const moon = new DirectionalLight("moon", new Vector3(-0.5, -1, -0.8), scene);
      moon.intensity = 0.14;
      moon.diffuse = new Color3(0.32, 0.38, 0.62);

      // ── Asphalt ground ────────────────────────────────────────────────────
      const ground = MeshBuilder.CreateGround(
        "ground",
        { width: 150, height: 150 },
        scene
      );
      const groundMat = new StandardMaterial("groundMat", scene);
      groundMat.diffuseColor = new Color3(0.04, 0.04, 0.055);
      groundMat.specularColor = new Color3(0.01, 0.01, 0.02);
      groundMat.emissiveColor = new Color3(0.006, 0.006, 0.01);
      ground.material = groundMat;
      ground.position.y = -0.12;

      // ── Road grid ─────────────────────────────────────────────────────────
      const ROAD_W = 5.5;
      // Vertical roads (run along Z axis)
      const vRoadXs = [-45, -27, -9, 9, 27, 45];
      // Horizontal roads (run along X axis)
      const hRoadZs = [-42, -22, -4, 14, 32, 50];

      const roadMat = new StandardMaterial("roadMat", scene);
      roadMat.diffuseColor = new Color3(0.062, 0.062, 0.082);
      roadMat.specularColor = new Color3(0.01, 0.01, 0.015);

      for (const rx of vRoadXs) {
        const road = MeshBuilder.CreateBox(
          `vroad_${rx}`,
          { width: ROAD_W, depth: 148, height: 0.1 },
          scene
        );
        road.position.set(rx, -0.07, 0);
        road.material = roadMat;
      }
      for (const rz of hRoadZs) {
        const road = MeshBuilder.CreateBox(
          `hroad_${rz}`,
          { width: 148, depth: ROAD_W, height: 0.1 },
          scene
        );
        road.position.set(0, -0.07, rz);
        road.material = roadMat;
      }

      // Amber centre-line markings
      const laneMat = new StandardMaterial("laneMat", scene);
      laneMat.emissiveColor = new Color3(0.5, 0.4, 0.08);
      laneMat.diffuseColor = new Color3(0.25, 0.2, 0.04);

      for (const rx of vRoadXs) {
        const line = MeshBuilder.CreateBox(
          `vline_${rx}`,
          { width: 0.12, depth: 144, height: 0.12 },
          scene
        );
        line.position.set(rx, 0.01, 0);
        line.material = laneMat;
      }
      for (const rz of hRoadZs) {
        const line = MeshBuilder.CreateBox(
          `hline_${rz}`,
          { width: 144, depth: 0.12, height: 0.12 },
          scene
        );
        line.position.set(0, 0.01, rz);
        line.material = laneMat;
      }

      // ── Background filler buildings (dense city feel) ──────────────────────
      const bgWinMat = new StandardMaterial("bgWinMat", scene);
      bgWinMat.emissiveColor = new Color3(0.62, 0.52, 0.26);

      const districtExcludeZones = [
        { cx: 0, cz: -20, r: 18 },
        { cx: -22, cz: 14, r: 18 },
        { cx: 22, cz: 14, r: 18 },
      ];

      function onRoad(x: number, z: number): boolean {
        for (const rx of vRoadXs) if (Math.abs(x - rx) < ROAD_W * 0.7) return true;
        for (const rz of hRoadZs) if (Math.abs(z - rz) < ROAD_W * 0.7) return true;
        return false;
      }

      function inDistrictZone(x: number, z: number): boolean {
        return districtExcludeZones.some(
          (d) => Math.hypot(x - d.cx, z - d.cz) < d.r
        );
      }

      let bgSeed = 1;
      for (let gx = -62; gx <= 62; gx += 9) {
        for (let gz = -62; gz <= 62; gz += 9) {
          bgSeed++;
          const jx = gx + (sr(bgSeed * 3) - 0.5) * 4.5;
          const jz = gz + (sr(bgSeed * 7) - 0.5) * 4.5;
          if (Math.abs(jx) > 60 || Math.abs(jz) > 60) continue;
          if (onRoad(jx, jz) || inDistrictZone(jx, jz)) continue;

          const bh = 1.8 + sr(bgSeed * 11) * 16;
          const bw = 2.2 + sr(bgSeed * 13) * 2.8;

          const bgBox = MeshBuilder.CreateBox(
            `bg_${bgSeed}`,
            { width: bw, depth: bw * (0.7 + sr(bgSeed * 5) * 0.6), height: bh },
            scene
          );
          bgBox.position.set(jx, bh / 2, jz);

          const grayBase = 0.05 + sr(bgSeed * 17) * 0.1;
          const tint = sr(bgSeed * 23);
          const bgMat = new StandardMaterial(`bgMat_${bgSeed}`, scene);
          if (tint < 0.33) {
            bgMat.diffuseColor = new Color3(grayBase * 0.9, grayBase * 0.9, grayBase * 1.2);
          } else if (tint < 0.66) {
            bgMat.diffuseColor = new Color3(grayBase * 1.1, grayBase, grayBase * 0.8);
          } else {
            bgMat.diffuseColor = new Color3(grayBase, grayBase * 1.05, grayBase);
          }
          bgMat.emissiveColor = new Color3(grayBase * 0.22, grayBase * 0.22, grayBase * 0.32);
          bgBox.material = bgMat;

          // Single window-strip overlay per bg building (efficient)
          const winH = bh * 0.72;
          const winOverlay = MeshBuilder.CreateBox(
            `bgwin_${bgSeed}`,
            { width: bw * 0.8, depth: 0.045, height: winH },
            scene
          );
          winOverlay.position.set(jx, bh * 0.5 + 0.1, jz + bw / 2 + 0.015);
          winOverlay.material = bgWinMat;

          // Rooftop detail (antenna or water tower — ~50% chance)
          if (sr(bgSeed * 43) > 0.52) {
            if (sr(bgSeed * 53) > 0.5) {
              // Slim antenna
              const ant = MeshBuilder.CreateCylinder(
                `bgant_${bgSeed}`,
                {
                  diameterTop: 0.03,
                  diameterBottom: 0.07,
                  height: 1.6 + sr(bgSeed) * 2.2,
                  tessellation: 5,
                },
                scene
              );
              ant.position.set(jx + bw * 0.28, bh + 0.85, jz + bw * 0.18);
              const antMat = new StandardMaterial(`bgantMat_${bgSeed}`, scene);
              antMat.diffuseColor = new Color3(0.22, 0.22, 0.25);
              ant.material = antMat;
            } else {
              // Water tower
              const wt = MeshBuilder.CreateCylinder(
                `bgwt_${bgSeed}`,
                { diameter: bw * 0.38, height: 0.9, tessellation: 8 },
                scene
              );
              wt.position.set(jx - bw * 0.22, bh + 0.45, jz - bw * 0.22);
              const wtMat = new StandardMaterial(`bgwtMat_${bgSeed}`, scene);
              wtMat.diffuseColor = new Color3(0.17, 0.13, 0.1);
              wt.material = wtMat;
            }
          }
        }
      }

      // ── District platforms + rings ─────────────────────────────────────────
      const districtKeys = ["LABEL_ROW", "DOWNTOWN_PRIME", "INDIE_BLOCKS"] as const;

      for (const dk of districtKeys) {
        const cfg = DISTRICT_CONFIG[dk];

        const platform = MeshBuilder.CreateBox(
          `platform_${dk}`,
          { width: 28, depth: 28, height: 0.35 },
          scene
        );
        platform.position.set(cfg.center.x, -0.07, cfg.center.z);
        const platMat = new StandardMaterial(`platMat_${dk}`, scene);
        platMat.diffuseColor = new Color3(
          cfg.platformColor.r,
          cfg.platformColor.g,
          cfg.platformColor.b
        );
        platMat.emissiveColor = new Color3(
          cfg.emissive.r * 0.45,
          cfg.emissive.g * 0.45,
          cfg.emissive.b * 0.45
        );
        platform.material = platMat;

        const ring = MeshBuilder.CreateTorus(
          `ring_${dk}`,
          { diameter: 30, thickness: 0.22, tessellation: 72 },
          scene
        );
        ring.position.set(cfg.center.x, 0.08, cfg.center.z);
        ring.rotation.x = Math.PI / 2;
        const ringMat = new StandardMaterial(`ringMat_${dk}`, scene);
        ringMat.emissiveColor = new Color3(cfg.color.r, cfg.color.g, cfg.color.b);
        ring.material = ringMat;

        const distLight = new PointLight(
          `light_${dk}`,
          new Vector3(cfg.center.x, 10, cfg.center.z),
          scene
        );
        distLight.diffuse = new Color3(
          cfg.lightColor.r,
          cfg.lightColor.g,
          cfg.lightColor.b
        );
        distLight.specular = new Color3(
          cfg.lightColor.r,
          cfg.lightColor.g,
          cfg.lightColor.b
        );
        distLight.intensity = 1.8;
        distLight.range = 55;
      }

      // ── Interactive buildings ─────────────────────────────────────────────
      const byDistrict: Record<string, CityBuilding[]> = {
        LABEL_ROW: [],
        DOWNTOWN_PRIME: [],
        INDIE_BLOCKS: [],
      };
      for (const b of buildings) {
        (byDistrict[b.district] ?? byDistrict.INDIE_BLOCKS).push(b);
      }

      const usernameMap = new Map<string, CityBuilding>();
      for (const b of buildings) usernameMap.set(b.username, b);

      // Per-district warm window materials
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const distWinMats: Record<string, any> = {};
      for (const dk of districtKeys) {
        const cfg = DISTRICT_CONFIG[dk];
        const wm = new StandardMaterial(`distWin_${dk}`, scene);
        wm.emissiveColor = new Color3(
          Math.min(1, cfg.color.r * 0.35 + 0.58),
          Math.min(1, cfg.color.g * 0.35 + 0.55),
          Math.min(1, cfg.color.b * 0.25 + 0.28)
        );
        distWinMats[dk] = wm;
      }

      for (const dk of districtKeys) {
        const cfg = DISTRICT_CONFIG[dk];
        const list = byDistrict[dk].slice(0, 16);
        const cols = 4;

        list.forEach((b, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const spacing = 5.8;
          const offX = (col - (cols - 1) / 2) * spacing;
          const offZ = (row - Math.floor(list.length / cols / 2)) * spacing;

          const height = Math.max(2, Math.min(20, b.level * 1.6 + b.avgScore * 0.1));
          const bw = 2.3 + b.level * 0.16;
          const bdepth = bw * (0.8 + sr(i * 7) * 0.4);
          const px = cfg.center.x + offX;
          const pz = cfg.center.z + offZ;

          // ── Main body ─────────────────────────────────────────────────────
          const box = MeshBuilder.CreateBox(
            `building_${b.username}`,
            { width: bw, depth: bdepth, height },
            scene
          );
          box.position.set(px, height / 2, pz);

          const mat = new StandardMaterial(`buildingMat_${b.username}`, scene);
          mat.diffuseColor = new Color3(
            cfg.color.r * 0.5,
            cfg.color.g * 0.5,
            cfg.color.b * 0.5
          );
          mat.emissiveColor = new Color3(cfg.emissive.r, cfg.emissive.g, cfg.emissive.b);
          mat.specularColor = new Color3(
            cfg.color.r * 0.35,
            cfg.color.g * 0.35,
            cfg.color.b * 0.35
          );
          mat.specularPower = 28;
          box.material = mat;

          // ── Window strips (front + back faces, per floor) ──────────────────
          const wm = distWinMats[dk];
          const floors = Math.floor(height / 2.2);
          for (let fl = 0; fl < floors; fl++) {
            const wy = fl * 2.2 + 1.2;
            if (wy > height - 0.6) continue;
            if (sr(i * 19 + fl * 37) < 0.18) continue; // ~18% dark floor

            const wFront = MeshBuilder.CreateBox(
              `wf_${b.username}_${fl}`,
              { width: bw * 0.82, depth: 0.04, height: 0.28 },
              scene
            );
            wFront.position.set(px, wy, pz + bdepth / 2 + 0.02);
            wFront.material = wm;

            const wBack = MeshBuilder.CreateBox(
              `wb_${b.username}_${fl}`,
              { width: bw * 0.82, depth: 0.04, height: 0.28 },
              scene
            );
            wBack.position.set(px, wy, pz - bdepth / 2 - 0.02);
            wBack.material = wm;
          }

          // ── Neon sign (30% of buildings) ──────────────────────────────────
          if (sr(i * 61 + 5) > 0.7) {
            const signMat = new StandardMaterial(`signMat_${b.username}`, scene);
            signMat.emissiveColor = new Color3(
              Math.min(1, cfg.color.r * 0.5 + 0.5),
              Math.min(1, cfg.color.g * 0.4 + 0.3),
              Math.min(1, cfg.color.b * 0.6 + 0.4)
            );
            const sign = MeshBuilder.CreateBox(
              `sign_${b.username}`,
              { width: bw * 0.65, depth: 0.07, height: 0.55 },
              scene
            );
            sign.position.set(px, height * 0.55, pz + bdepth / 2 + 0.05);
            sign.material = signMat;
          }

          // ── Roof neon cap ─────────────────────────────────────────────────
          const cap = MeshBuilder.CreateBox(
            `cap_${b.username}`,
            { width: bw + 0.2, depth: bdepth + 0.2, height: 0.22 },
            scene
          );
          cap.position.set(px, height + 0.11, pz);
          const capMat = new StandardMaterial(`capMat_${b.username}`, scene);
          capMat.emissiveColor = new Color3(cfg.color.r, cfg.color.g, cfg.color.b);
          cap.material = capMat;

          // ── Rooftop detail (antenna or water tower) ────────────────────────
          if (sr(i * 71 + 13) > 0.42) {
            if (sr(i * 83 + 7) > 0.5) {
              // Antenna
              const antHeight = 1.8 + sr(i * 11) * 2.4;
              const ant = MeshBuilder.CreateCylinder(
                `ant_${b.username}`,
                { diameterTop: 0.04, diameterBottom: 0.09, height: antHeight, tessellation: 6 },
                scene
              );
              ant.position.set(px + bw * 0.35, height + antHeight / 2, pz + bw * 0.3);
              const antMat = new StandardMaterial(`antMat_${b.username}`, scene);
              antMat.diffuseColor = new Color3(0.28, 0.28, 0.32);
              antMat.emissiveColor = new Color3(0.05, 0.05, 0.07);
              ant.material = antMat;

              // Red blinking light at antenna tip
              const blink = MeshBuilder.CreateSphere(
                `blink_${b.username}`,
                { diameter: 0.22, segments: 4 },
                scene
              );
              blink.position.set(
                px + bw * 0.35,
                height + antHeight + 0.12,
                pz + bw * 0.3
              );
              const blinkMat = new StandardMaterial(`blinkMat_${b.username}`, scene);
              blinkMat.emissiveColor = new Color3(1, 0.1, 0.05);
              blink.material = blinkMat;
            } else {
              // Water tower
              const wt = MeshBuilder.CreateCylinder(
                `wt_${b.username}`,
                { diameter: bw * 0.4, height: 1.1, tessellation: 8 },
                scene
              );
              wt.position.set(px - bw * 0.28, height + 0.55, pz - bw * 0.28);
              const wtMat = new StandardMaterial(`wtMat_${b.username}`, scene);
              wtMat.diffuseColor = new Color3(0.18, 0.14, 0.1);
              wtMat.emissiveColor = new Color3(0.03, 0.02, 0.01);
              wt.material = wtMat;

              const wtLeg = MeshBuilder.CreateCylinder(
                `wtleg_${b.username}`,
                { diameter: 0.1, height: 0.6, tessellation: 4 },
                scene
              );
              wtLeg.position.set(px - bw * 0.28, height + 0.3, pz - bw * 0.28);
              wtLeg.material = wtMat;
            }
          }

          // ── Hover / click interactions ─────────────────────────────────────
          box.actionManager = new ActionManager(scene);

          box.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
              const building = usernameMap.get(b.username);
              if (!building) return;
              const meshPos = box.getAbsolutePosition();
              const screenPos = Vector3.Project(
                meshPos,
                scene.getTransformMatrix(),
                scene.getTransformMatrix(),
                camera.viewport.toGlobal(
                  engineInstance.getRenderWidth(),
                  engineInstance.getRenderHeight()
                )
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (box.material as any).emissiveColor = new Color3(
                cfg.color.r * 0.5,
                cfg.color.g * 0.5,
                cfg.color.b * 0.5
              );
            })
          );

          box.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
              tooltipRef.current = { ...tooltipRef.current, visible: false };
              updateTooltipDOM(tooltipRef.current);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (box.material as any).emissiveColor = new Color3(
                cfg.emissive.r,
                cfg.emissive.g,
                cfg.emissive.b
              );
            })
          );

          box.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
              router.push(`/studio/${b.username}`);
            })
          );
        });
      }

      // ── Streetlights (amber poles at intersections) ────────────────────────
      const poleMat = new StandardMaterial("poleMat", scene);
      poleMat.diffuseColor = new Color3(0.22, 0.22, 0.26);
      poleMat.emissiveColor = new Color3(0.04, 0.04, 0.05);

      const globeMat = new StandardMaterial("globeMat", scene);
      globeMat.emissiveColor = new Color3(1, 0.82, 0.42);
      globeMat.diffuseColor = new Color3(0.75, 0.62, 0.3);

      const lampDefs: [number, number][] = [
        [-9, -26], [9, -26], [-9, -14], [9, -14],         // around LABEL_ROW
        [-31, 5], [-13, 5], [-31, 23], [-13, 23],          // around DOWNTOWN_PRIME
        [13, 5], [31, 5], [13, 23], [31, 23],              // around INDIE_BLOCKS
        [-44, -40], [-26, -40], [8, -40], [26, -40],       // outer edge row
        [-44, 14], [44, 14], [-26, 32], [26, 32],          // mid city
      ];

      for (let li = 0; li < lampDefs.length; li++) {
        const [lx, lz] = lampDefs[li];
        const poleH = 6.8;

        const pole = MeshBuilder.CreateCylinder(
          `lp_${li}`,
          { diameter: 0.14, height: poleH, tessellation: 6 },
          scene
        );
        pole.position.set(lx, poleH / 2, lz);
        pole.material = poleMat;

        const arm = MeshBuilder.CreateBox(
          `la_${li}`,
          { width: 1.6, depth: 0.1, height: 0.1 },
          scene
        );
        arm.position.set(lx + 0.8, poleH - 0.28, lz);
        arm.material = poleMat;

        const globe = MeshBuilder.CreateSphere(
          `lg_${li}`,
          { diameter: 0.52, segments: 6 },
          scene
        );
        globe.position.set(lx + 1.52, poleH - 0.44, lz);
        globe.material = globeMat;

        // PointLight on every other lamp (performance)
        if (li % 2 === 0) {
          const pl = new PointLight(
            `ll_${li}`,
            new Vector3(lx + 1.52, poleH - 0.6, lz),
            scene
          );
          pl.diffuse = new Color3(1, 0.76, 0.36);
          pl.specular = new Color3(0.75, 0.55, 0.2);
          pl.intensity = 0.95;
          pl.range = 20;
        }
      }

      // ── Moving cars ───────────────────────────────────────────────────────
      const carBodyMat = new StandardMaterial("carBodyMat", scene);
      carBodyMat.diffuseColor = new Color3(0.07, 0.07, 0.09);
      carBodyMat.emissiveColor = new Color3(0.025, 0.025, 0.035);
      carBodyMat.specularColor = new Color3(0.18, 0.18, 0.22);

      const headlightMat = new StandardMaterial("headlightMat", scene);
      headlightMat.emissiveColor = new Color3(0.92, 0.9, 0.68);

      const taillightMat = new StandardMaterial("taillightMat", scene);
      taillightMat.emissiveColor = new Color3(0.88, 0.05, 0.05);

      interface CarDef {
        axis: "x" | "z";
        lane: number;
        startPos: number;
        dir: 1 | -1;
        speed: number;
      }

      const CAR_DEFS: CarDef[] = [
        { axis: "z", lane: -44,  startPos: -55, dir:  1, speed: 0.22 },
        { axis: "z", lane: -42,  startPos:  18, dir: -1, speed: 0.17 },
        { axis: "z", lane: -26,  startPos: -35, dir:  1, speed: 0.15 },
        { axis: "z", lane: -24,  startPos:  32, dir: -1, speed: 0.25 },
        { axis: "z", lane:  10,  startPos:  42, dir: -1, speed: 0.20 },
        { axis: "z", lane:   8,  startPos: -12, dir:  1, speed: 0.18 },
        { axis: "z", lane:  28,  startPos:   5, dir:  1, speed: 0.21 },
        { axis: "x", lane: -40,  startPos: -52, dir:  1, speed: 0.19 },
        { axis: "x", lane: -38,  startPos:  14, dir: -1, speed: 0.23 },
        { axis: "x", lane:  -3,  startPos:  32, dir: -1, speed: 0.16 },
        { axis: "x", lane:  -5,  startPos: -22, dir:  1, speed: 0.26 },
        { axis: "x", lane:  15,  startPos:  22, dir:  1, speed: 0.18 },
      ];

      type CarState = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: any;
        pos: number;
        def: CarDef;
      };

      const carStates: CarState[] = [];

      for (let ci = 0; ci < CAR_DEFS.length; ci++) {
        const def = CAR_DEFS[ci];

        const carBody = MeshBuilder.CreateBox(
          `carBody_${ci}`,
          { width: 1.3, depth: 2.5, height: 0.58 },
          scene
        );
        carBody.material = carBodyMat;

        // Cab roof section
        const carTop = MeshBuilder.CreateBox(
          `carTop_${ci}`,
          { width: 1.05, depth: 1.2, height: 0.42 },
          scene
        );
        carTop.parent = carBody;
        carTop.position.set(0, 0.5, 0.1);
        carTop.material = carBodyMat;

        // Headlights
        const hl = MeshBuilder.CreateBox(
          `hl_${ci}`,
          { width: 0.62, depth: 0.06, height: 0.15 },
          scene
        );
        hl.parent = carBody;
        hl.position.set(0, -0.05, 1.24);
        hl.material = headlightMat;

        // Taillights
        const tl = MeshBuilder.CreateBox(
          `tl_${ci}`,
          { width: 0.62, depth: 0.06, height: 0.13 },
          scene
        );
        tl.parent = carBody;
        tl.position.set(0, -0.05, -1.24);
        tl.material = taillightMat;

        // Initial world position + heading
        if (def.axis === "z") {
          carBody.position.set(def.lane + (def.dir > 0 ? -1.2 : 1.2), 0.34, def.startPos);
          carBody.rotation.y = def.dir > 0 ? 0 : Math.PI;
        } else {
          carBody.position.set(def.startPos, 0.34, def.lane + (def.dir > 0 ? -1.2 : 1.2));
          carBody.rotation.y = def.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }

        carStates.push({ body: carBody, pos: def.startPos, def });
      }

      // ── Star field ────────────────────────────────────────────────────────
      const stars = new ParticleSystem("stars", 1000, scene);
      stars.particleTexture = new Texture(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAH0lEQVQI12NkYGD4z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg==",
        scene
      );
      stars.emitter = new Vector3(0, 0, 0);
      stars.minEmitBox = new Vector3(-90, 35, -90);
      stars.maxEmitBox = new Vector3(90, 90, 90);
      stars.color1 = new Color4(1, 1, 1, 0.9);
      stars.color2 = new Color4(0.7, 0.8, 1, 0.65);
      stars.colorDead = new Color4(0, 0, 0, 0);
      stars.minSize = 0.06;
      stars.maxSize = 0.2;
      stars.minLifeTime = 9;
      stars.maxLifeTime = 14;
      stars.emitRate = 95;
      stars.blendMode = ParticleSystem.BLENDMODE_ONEONE;
      stars.gravity = new Vector3(0, -0.008, 0);
      stars.direction1 = new Vector3(-0.04, -0.015, -0.04);
      stars.direction2 = new Vector3(0.04, 0.015, 0.04);
      stars.minAngularSpeed = 0;
      stars.maxAngularSpeed = 0.08;
      stars.minEmitPower = 0.04;
      stars.maxEmitPower = 0.12;
      stars.updateSpeed = 0.01;
      stars.start();

      // ── Floating district orbs ────────────────────────────────────────────
      const ORB_DATA = [
        { pos: new Vector3(-22, 14, 14), color: new Color4(0.42, 0.36, 0.9, 0.65) },
        { pos: new Vector3(0, 18, -20),  color: new Color4(1, 0.84, 0, 0.65) },
        { pos: new Vector3(22, 12, 14),  color: new Color4(0, 0.96, 1, 0.65) },
      ];

      for (let oi = 0; oi < ORB_DATA.length; oi++) {
        const orb = ORB_DATA[oi];
        const orbPs = new ParticleSystem(`orb_${oi}`, 80, scene);
        orbPs.particleTexture = stars.particleTexture;
        orbPs.emitter = orb.pos;
        orbPs.minEmitBox = new Vector3(-1.5, -1.5, -1.5);
        orbPs.maxEmitBox = new Vector3(1.5, 1.5, 1.5);
        orbPs.color1 = orb.color;
        orbPs.color2 = new Color4(
          orb.color.r * 0.38,
          orb.color.g * 0.38,
          orb.color.b * 0.38,
          0.22
        );
        orbPs.colorDead = new Color4(0, 0, 0, 0);
        orbPs.minSize = 0.22;
        orbPs.maxSize = 0.62;
        orbPs.minLifeTime = 1.8;
        orbPs.maxLifeTime = 3.5;
        orbPs.emitRate = 22;
        orbPs.blendMode = ParticleSystem.BLENDMODE_ONEONE;
        orbPs.gravity = new Vector3(0, 0.32, 0);
        orbPs.direction1 = new Vector3(-0.6, 0.6, -0.6);
        orbPs.direction2 = new Vector3(0.6, 1.2, 0.6);
        orbPs.minEmitPower = 0.08;
        orbPs.maxEmitPower = 0.28;
        orbPs.updateSpeed = 0.014;
        orbPs.start();
      }

      // ── Render loop ───────────────────────────────────────────────────────
      const CAR_RANGE = 66;
      engineInstance.runRenderLoop(() => {
        // Animate cars along their lanes
        for (const cs of carStates) {
          cs.pos += cs.def.dir * cs.def.speed;
          if (cs.pos > CAR_RANGE) cs.pos = -CAR_RANGE;
          if (cs.pos < -CAR_RANGE) cs.pos = CAR_RANGE;

          if (cs.def.axis === "z") {
            cs.body.position.z = cs.pos;
          } else {
            cs.body.position.x = cs.pos;
          }
        }

        scene.render();
      });

      const handleResize = () => engineInstance.resize();
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        stars.dispose();
        engineInstance.dispose();
      };
    }

    let cleanup: (() => void) | undefined;
    initScene().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cleanup?.();
    };
  }, [buildings, router, updateTooltipDOM]);

  return (
    <div className="relative w-full" style={{ height: 620 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block rounded-2xl"
        style={{ touchAction: "none" }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipElRef}
        className="pointer-events-none absolute z-20 hidden rounded-xl border border-white/15 bg-[#09090f]/92 px-4 py-3 backdrop-blur-sm shadow-xl"
        style={{ minWidth: 160 }}
      >
        <p className="font-bold text-sm text-white" data-tip-name />
        <p className="text-xs text-white/50 mt-0.5" data-tip-district />
        <div className="flex gap-3 mt-1.5">
          <span className="text-xs font-semibold text-brand-400" data-tip-level />
          <span className="text-xs text-gold-400" data-tip-score />
        </div>
        <p className="text-[10px] text-white/35 mt-1.5">Click to open studio →</p>
      </div>

      {/* District legend overlay */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5">
        {(
          [
            { dk: "LABEL_ROW",      color: "bg-gold-500",   text: "text-gold-400" },
            { dk: "DOWNTOWN_PRIME", color: "bg-brand-500",  text: "text-brand-400" },
            { dk: "INDIE_BLOCKS",   color: "bg-accent-500", text: "text-accent-400" },
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
