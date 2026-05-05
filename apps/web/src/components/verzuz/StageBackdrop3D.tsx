"use client";

import { useEffect, useMemo, useRef } from "react";

type Props = {
  status: "SCHEDULED" | "LIVE" | "COMPLETED";
  artistA: string;
  artistB: string;
  theme: string | null;
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export default function StageBackdrop3D({ status, artistA, artistB, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labels = useMemo(
    () => ({
      a: artistA.slice(0, 48),
      b: artistB.slice(0, 48),
      theme: (theme ?? "").slice(0, 72),
    }),
    [artistA, artistB, theme],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Lazy-load three so the rest of the page becomes interactive ASAP.
    let disposed = false;
    let raf = 0;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const THREE = await import("three");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer> | null = null;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
      } catch {
        // WebGL unavailable (older devices / disabled). Keep the CSS stage.
        return;
      }
      if (!renderer) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x06060a, 10, 55);

      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
      camera.position.set(0, 9.5, 26);
      camera.lookAt(0, 6.5, 0);

      // Stage geometry
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(80, 80, 1, 1),
        new THREE.MeshStandardMaterial({
          color: 0x07070d,
          roughness: 0.85,
          metalness: 0.15,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.01;
      scene.add(floor);

      const riser = new THREE.Mesh(
        new THREE.BoxGeometry(26, 0.9, 10),
        new THREE.MeshStandardMaterial({
          color: 0x0d0c14,
          roughness: 0.7,
          metalness: 0.35,
        }),
      );
      riser.position.set(0, 0.45, 0);
      scene.add(riser);

      const led = new THREE.Mesh(
        new THREE.PlaneGeometry(22, 7),
        new THREE.MeshStandardMaterial({
          color: 0x0a0a12,
          roughness: 0.6,
          metalness: 0.1,
          emissive: 0x1b1130,
          emissiveIntensity: status === "LIVE" ? 1.15 : 0.65,
        }),
      );
      led.position.set(0, 6.2, -7);
      scene.add(led);

      // Lighting
      const ambient = new THREE.AmbientLight(0x2a2a38, 0.9);
      scene.add(ambient);

      const key = new THREE.DirectionalLight(0xffffff, status === "LIVE" ? 0.9 : 0.55);
      key.position.set(4, 16, 10);
      scene.add(key);

      const rimA = new THREE.PointLight(0x7c3aed, status === "LIVE" ? 2.0 : 1.0, 80);
      rimA.position.set(-12, 10, 10);
      scene.add(rimA);

      const rimB = new THREE.PointLight(0x00f5ff, status === "LIVE" ? 2.0 : 1.0, 80);
      rimB.position.set(12, 10, 10);
      scene.add(rimB);

      // Fake spotlight beams (cheap + looks stage-y)
      const beamGeo = new THREE.ConeGeometry(5.5, 24, 32, 1, true);
      const beamMatA = new THREE.MeshBasicMaterial({
        color: 0x7c3aed,
        transparent: true,
        opacity: 0.085,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const beamMatB = new THREE.MeshBasicMaterial({
        color: 0x00f5ff,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const beamA = new THREE.Mesh(beamGeo, beamMatA);
      beamA.position.set(-9, 16, 12);
      beamA.rotation.x = Math.PI;
      scene.add(beamA);

      const beamB = new THREE.Mesh(beamGeo, beamMatB);
      beamB.position.set(9, 16, 12);
      beamB.rotation.x = Math.PI;
      scene.add(beamB);

      // Resize observer to keep the canvas crisp.
      const ro = new ResizeObserver(() => {
        const { width, height } = canvas.getBoundingClientRect();
        if (width <= 0 || height <= 0) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      });
      ro.observe(canvas);

      // Render loop (disabled when user prefers reduced motion).
      const reduced = prefersReducedMotion();
      const t0 = performance.now();
      const tick = () => {
        if (disposed) return;
        const t = (performance.now() - t0) / 1000;
        if (!reduced && status === "LIVE") {
          beamA.rotation.z = Math.sin(t * 0.55) * 0.18 - 0.15;
          beamB.rotation.z = Math.cos(t * 0.6) * 0.18 + 0.15;
          rimA.intensity = 1.6 + Math.sin(t * 1.3) * 0.35;
          rimB.intensity = 1.6 + Math.cos(t * 1.2) * 0.35;
          const ledMaterial = led.material;
          if (ledMaterial instanceof THREE.MeshStandardMaterial) {
            ledMaterial.emissiveIntensity = 1.0 + Math.sin(t * 0.35) * 0.25;
          }
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      type Disposable = { dispose: () => void };
      type DisposableMesh = { geometry: Disposable; material: Disposable | Disposable[] };

      const disposeMaterial = (material: Disposable | Disposable[]) => {
        if (Array.isArray(material)) {
          for (const m of material) m.dispose();
          return;
        }
        material.dispose();
      };

      const disposeMesh = (mesh: DisposableMesh) => {
        mesh.geometry.dispose();
        disposeMaterial(mesh.material);
      };

      cleanup = () => {
        ro.disconnect();
        cancelAnimationFrame(raf);
        renderer.dispose();
        beamGeo.dispose();
        beamMatA.dispose();
        beamMatB.dispose();
        disposeMesh(floor);
        disposeMesh(riser);
        disposeMesh(led);
      };
    })();

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [status]);

  // Use a subtle overlay label so the stage feels "event-grade" even
  // before WebGL finishes loading.
  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full opacity-70" />
      <div className="absolute inset-x-0 top-10 mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.26em] text-white/45 backdrop-blur">
            {status === "LIVE" ? "On Stage" : status === "SCHEDULED" ? "Stage Lights" : "Stage Closed"}
          </span>
          {labels.theme && (
            <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 backdrop-blur">
              {labels.theme}
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 backdrop-blur">
            {labels.a} vs {labels.b}
          </span>
        </div>
      </div>
    </div>
  );
}
