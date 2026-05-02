"use client";

import { useEffect, useRef } from "react";
import type { Song } from "@ems/db";

interface MarketplaceWorld3DProps {
  items: (Song & { rankScore?: number })[];
}

export default function MarketplaceWorld3D({
  items,
}: MarketplaceWorld3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !items.length) return;
    const canvas = canvasRef.current;

    let engine: import("@babylonjs/core").Engine | undefined;

    async function initScene() {
      const {
        Engine,
        Scene,
        ArcRotateCamera,
        Vector3,
        HemisphericLight,
        MeshBuilder,
        StandardMaterial,
        Color3,
        Color4,
      } = await import("@babylonjs/core");

      const engineInstance = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        antialias: true,
      });
      engine = engineInstance;

      const scene = new Scene(engineInstance);
      scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);

      // Camera setup
      const camera = new ArcRotateCamera(
        "cam",
        -Math.PI / 2,
        Math.PI / 3,
        50,
        new Vector3(0, 0, 0),
        scene,
      );
      camera.attachControl(canvas, true);
      camera.lowerRadiusLimit = 20;
      camera.upperRadiusLimit = 100;

      // Lighting
      const light = new HemisphericLight(
        "light",
        new Vector3(0, 1, 0),
        scene,
      );
      light.intensity = 0.6;
      light.diffuse = new Color3(0.9, 0.9, 1);
      light.groundColor = new Color3(0.2, 0.2, 0.3);

      // Create spheres for each ranked item
      items.slice(0, 10).forEach((item, index) => {
        const angle = (index / 10) * Math.PI * 2;
        const radius = 20;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 2 + index * 0.5;

        const sphere = MeshBuilder.CreateSphere(
          `item_${item.id}`,
          { diameter: 2 },
          scene,
        );
        sphere.position = new Vector3(x, y, z);

        const material = new StandardMaterial(`mat_${item.id}`, scene);
        // Color based on rank
        const hue = (index / 10) * 360;
        material.diffuseColor = new Color3(0.5, 0.7, 1);
        material.emissiveColor = new Color3(
          Math.sin(hue * Math.PI / 180) * 0.3 + 0.3,
          Math.cos(hue * Math.PI / 180) * 0.3 + 0.3,
          0.5,
        );
        sphere.material = material;
      });

      // Get top bidder (first ranked item)
      const topBidder = items[0];

      if (topBidder) {
        const crown = MeshBuilder.CreateSphere(
          "crown",
          { diameter: 1.2 },
          scene,
        );
        crown.position = new Vector3(0, 8, 5.6);

        const crownMat = new StandardMaterial("crown-mat", scene);
        crownMat.emissiveColor = new Color3(1, 0.8, 0.2);
        crown.material = crownMat;

        const spotlight = MeshBuilder.CreateCylinder(
          "spotlight",
          {
            height: 10,
            diameterTop: 0,
            diameterBottom: 2,
          },
          scene,
        );
        spotlight.position = new Vector3(0, 4, 5.6);

        const lightMat = new StandardMaterial("light-mat", scene);
        lightMat.emissiveColor = new Color3(1, 0.9, 0.4);
        lightMat.alpha = 0.3;
        spotlight.material = lightMat;
      }

      // Handle resize
      const handleResize = () => {
        engine?.resize();
      };
      window.addEventListener("resize", handleResize);

      // Render loop
      engineInstance.runRenderLoop(() => {
        scene.render();
      });

      return () => {
        window.removeEventListener("resize", handleResize);
        scene.dispose();
        engineInstance.dispose();
      };
    }

    const cleanup = initScene();
    return () => {
      cleanup?.then((c) => c?.());
      engine?.dispose();
    };
  }, [items]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/8 bg-[#0d0d14]">
      <canvas
        ref={canvasRef}
        className="h-[400px] w-full"
        style={{ display: "block" }}
      />
    </div>
  );
}
