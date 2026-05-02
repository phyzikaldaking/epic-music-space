"use client";

import { useEffect, useRef } from "react";
import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";

type WorldItem = {
  id: string;
  title: string;
  artist: string;
  aiScore?: number;
};

interface MarketplaceWorld3DProps {
  items: WorldItem[];
}

export default function MarketplaceWorld3D({ items }: MarketplaceWorld3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
    const scene = new Scene(engine);
    scene.clearColor = Color3.FromHexString("#050509").toColor4(1);

    const camera = new ArcRotateCamera("ems-camera", -Math.PI / 2, Math.PI / 2.45, 18, new Vector3(0, 2.2, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 26;
    camera.wheelDeltaPercentage = 0.01;

    const light = new HemisphericLight("ems-light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.82;

    const floor = MeshBuilder.CreateGround("studio-floor", { width: 28, height: 18, subdivisions: 2 }, scene);
    const floorMat = new StandardMaterial("floor-mat", scene);
    floorMat.diffuseColor = new Color3(0.02, 0.025, 0.045);
    floorMat.emissiveColor = new Color3(0.01, 0.025, 0.035);
    floor.material = floorMat;

    const wall = MeshBuilder.CreateBox("screen-wall", { width: 26, height: 7, depth: 0.2 }, scene);
    wall.position = new Vector3(0, 3.5, 6);
    const wallMat = new StandardMaterial("wall-mat", scene);
    wallMat.diffuseColor = new Color3(0.025, 0.025, 0.04);
    wallMat.emissiveColor = new Color3(0.015, 0.025, 0.04);
    wall.material = wallMat;

    const screenMat = new StandardMaterial("screen-mat", scene);
    screenMat.diffuseColor = new Color3(0.06, 0.07, 0.11);
    screenMat.emissiveColor = new Color3(0.07, 0.22, 0.25);
    const hotMat = new StandardMaterial("hot-screen-mat", scene);
    hotMat.diffuseColor = new Color3(0.10, 0.08, 0.14);
    hotMat.emissiveColor = new Color3(0.35, 0.16, 0.55);

    items.slice(0, 12).forEach((item, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const screen = MeshBuilder.CreateBox(`screen-${item.id}`, { width: 4.6, height: 2.2, depth: 0.18 }, scene);
      screen.position = new Vector3((col - 1.5) * 5.6, 5.5 - row * 2.55, 5.76);
      screen.material = index < 3 ? hotMat : screenMat;

      const glow = MeshBuilder.CreateBox(`screen-glow-${item.id}`, { width: 4.9, height: 2.45, depth: 0.05 }, scene);
      glow.position = new Vector3(screen.position.x, screen.position.y, 5.68);
      const glowMat = new StandardMaterial(`glow-mat-${item.id}`, scene);
      glowMat.diffuseColor = new Color3(0, 0, 0);
      glowMat.emissiveColor = index < 3 ? new Color3(0.35, 0.22, 0.05) : new Color3(0.02, 0.18, 0.22);
      glowMat.alpha = 0.35;
      glow.material = glowMat;
    });

    engine.runRenderLoop(() => {
      wall.rotation.y = Math.sin(Date.now() * 0.00035) * 0.015;
      scene.render();
    });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      scene.dispose();
      engine.dispose();
    };
  }, [items]);

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/50 shadow-2xl shadow-black/60">
      <canvas ref={canvasRef} className="h-[420px] w-full touch-none" aria-label="Interactive 3D Epic Music Space marketplace studio" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-200">Babylon 3D World</p>
        <p className="mt-1 text-sm text-white/60">Drag to orbit · Scroll to move · Screens map to marketplace rooms</p>
      </div>
    </div>
  );
}
