"use client";

import { useEffect, useRef } from "react";
import type { Billboard } from "@/types/database";

interface CitySceneProps {
  billboards: Billboard[];
  className?: string;
}

export function CityScene({ billboards, className }: CitySceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep refs for cleanup
  const engineRef = useRef<import("@babylonjs/core").Engine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let disposed = false;

    const initScene = async () => {
      const {
        Engine,
        Scene,
        Vector3,
        HemisphericLight,
        MeshBuilder,
        StandardMaterial,
        Color3,
        Color4,
        ArcRotateCamera,
        Texture,
        DynamicTexture,
      } = await import("@babylonjs/core");

      if (disposed || !canvasRef.current) return;

      const engine = new Engine(canvasRef.current, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      engineRef.current = engine;

      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.02, 0.02, 0.08, 1); // Deep space blue

      // --- CAMERA ---
      const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 3.5, 40, Vector3.Zero(), scene);
      camera.lowerRadiusLimit = 10;
      camera.upperRadiusLimit = 80;
      camera.upperBetaLimit = Math.PI / 2.1;
      camera.attachControl(canvasRef.current, true);

      // --- LIGHTING ---
      const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
      light.intensity = 0.9;
      light.groundColor = new Color3(0.1, 0.05, 0.2);

      // --- GROUND ---
      const ground = MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
      const groundMat = new StandardMaterial("groundMat", scene);
      groundMat.diffuseColor = new Color3(0.05, 0.05, 0.12);
      groundMat.specularColor = new Color3(0, 0, 0);
      ground.material = groundMat;

      // --- GRID LINES on ground ---
      const gridTexture = new DynamicTexture("gridTex", { width: 512, height: 512 }, scene);
      const ctx = gridTexture.getContext() as unknown as CanvasRenderingContext2D;
      ctx.fillStyle = "#0d0d20";
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = "#8b5cf620";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 512; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
      }
      gridTexture.update();
      groundMat.diffuseTexture = gridTexture;

      // --- BUILDINGS ---
      const buildingPositions = [
        [-12, 0, -12], [-8, 0, -14], [-4, 0, -16], [4, 0, -16], [8, 0, -14], [12, 0, -12],
        [-15, 0, -5], [-15, 0, 5], [15, 0, -5], [15, 0, 5],
        [-12, 0, 12], [-8, 0, 14], [8, 0, 14], [12, 0, 12],
      ];

      const buildingColors = [
        new Color3(0.3, 0.1, 0.5),
        new Color3(0.1, 0.2, 0.5),
        new Color3(0.2, 0.1, 0.4),
        new Color3(0.15, 0.05, 0.45),
      ];

      buildingPositions.forEach(([x, , z], idx) => {
        const h = 3 + Math.random() * 8;
        const w = 1.5 + Math.random() * 1.5;
        const box = MeshBuilder.CreateBox(`building_${idx}`, { width: w, height: h, depth: w }, scene);
        box.position = new Vector3(x!, h / 2, z!);

        const mat = new StandardMaterial(`bMat_${idx}`, scene);
        mat.diffuseColor = buildingColors[idx % buildingColors.length]!;
        mat.specularColor = new Color3(0.1, 0.1, 0.2);
        mat.emissiveColor = buildingColors[idx % buildingColors.length]!.scale(0.15);
        box.material = mat;
      });

      // --- ROAD ---
      const road = MeshBuilder.CreateGround("road", { width: 8, height: 100 }, scene);
      const roadMat = new StandardMaterial("roadMat", scene);
      roadMat.diffuseColor = new Color3(0.07, 0.07, 0.1);
      road.material = roadMat;
      road.position.y = 0.01;

      const crossRoad = MeshBuilder.CreateGround("crossRoad", { width: 100, height: 8 }, scene);
      crossRoad.material = roadMat;
      crossRoad.position.y = 0.01;

      // --- BILLBOARD STRUCTURES ---
      const billboardSlotPositions: [number, number, number][] = [
        [-10, 0, -8], [-6, 0, -10], [0, 0, -12], [6, 0, -10], [10, 0, -8],
        [-12, 0, 0], [12, 0, 0],
        [-10, 0, 8], [-6, 0, 10], [0, 0, 12], [6, 0, 10], [10, 0, 8],
      ];

      billboardSlotPositions.forEach(([x, , z], slotIdx) => {
        const slotNum = slotIdx + 1;
        const activeBillboard = billboards.find((b) => b.slot === slotNum);

        // Post
        const post = MeshBuilder.CreateCylinder(`post_${slotNum}`, { height: 4, diameter: 0.2 }, scene);
        post.position = new Vector3(x!, 2, z!);
        const postMat = new StandardMaterial(`postMat_${slotNum}`, scene);
        postMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
        post.material = postMat;

        // Billboard panel
        const panel = MeshBuilder.CreatePlane(`panel_${slotNum}`, { width: 3, height: 1.8 }, scene);
        panel.position = new Vector3(x!, 5, z!);
        panel.lookAt(new Vector3(0, 5, 0)); // Face center

        if (activeBillboard) {
          const panelMat = new StandardMaterial(`panelMat_${slotNum}`, scene);
          const tex = new Texture(activeBillboard.image_url, scene);
          panelMat.diffuseTexture = tex;
          panelMat.emissiveColor = new Color3(0.8, 0.8, 0.8);
          panelMat.backFaceCulling = false;
          panel.material = panelMat;
        } else {
          // Empty slot: show glowing frame
          const panelMat = new StandardMaterial(`emptyMat_${slotNum}`, scene);
          panelMat.diffuseColor = new Color3(0.1, 0.05, 0.2);
          panelMat.emissiveColor = new Color3(0.2, 0.05, 0.4);
          panelMat.wireframe = false;
          panelMat.backFaceCulling = false;
          panel.material = panelMat;

          // Slot number texture
          const numTex = new DynamicTexture(`numTex_${slotNum}`, { width: 128, height: 128 }, scene);
          const numCtx = numTex.getContext() as unknown as CanvasRenderingContext2D;
          numCtx.fillStyle = "#1a0a2e";
          numCtx.fillRect(0, 0, 128, 128);
          numCtx.fillStyle = "#8b5cf6";
          numCtx.font = "bold 48px sans-serif";
          numCtx.textAlign = "center";
          numCtx.textBaseline = "middle";
          numCtx.fillText(`#${slotNum}`, 64, 64);
          numTex.update();
          panelMat.diffuseTexture = numTex;
        }
      });

      // --- ANIMATED PARTICLES (stars) ---
      // Simple pulsing billboard lights
      let tick = 0;
      scene.onBeforeRenderObservable.add(() => {
        tick += 0.02;
        // Subtle camera auto-rotate
        camera.alpha += 0.0005;
      });

      engine.runRenderLoop(() => {
        if (!disposed) scene.render();
      });

      window.addEventListener("resize", () => engine.resize());
    };

    initScene();

    return () => {
      disposed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [billboards]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: "none" }}
    />
  );
}
