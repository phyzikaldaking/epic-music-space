"use client";

import { useEffect, useMemo, useRef } from "react";
// Type-only import — the runtime value comes from the dynamic
// `import("three")` below. Without this, `as THREE.BufferAttribute`
// fails to compile because THREE is a value binding, not a namespace.
import type { BufferAttribute as ThreeBufferAttribute } from "three";

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
        return;
      }
      if (!renderer) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x06060a, 0.028);

      const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
      camera.position.set(0, 8.5, 28);
      camera.lookAt(0, 5.5, 0);

      // --- FLOOR: reflective dark surface ---
      const floorGeo = new THREE.PlaneGeometry(120, 120);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x06060d,
        roughness: 0.12,
        metalness: 0.85,
        envMapIntensity: 1.2,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      // --- STAGE RISER ---
      const riserGeo = new THREE.BoxGeometry(30, 0.7, 12);
      const riserMat = new THREE.MeshStandardMaterial({
        color: 0x0c0b16,
        roughness: 0.6,
        metalness: 0.5,
      });
      const riser = new THREE.Mesh(riserGeo, riserMat);
      riser.position.set(0, 0.35, 0);
      riser.receiveShadow = true;
      riser.castShadow = true;
      scene.add(riser);

      // --- LED BACKDROP (main screen) ---
      const ledGeo = new THREE.PlaneGeometry(26, 9);
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x08071a,
        roughness: 0.3,
        metalness: 0.0,
        emissive: status === "LIVE" ? new THREE.Color(0x1a0835) : new THREE.Color(0x0d0620),
        emissiveIntensity: status === "LIVE" ? 1.4 : 0.7,
      });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0, 6.0, -8.5);
      scene.add(led);

      // --- SIDE PANELS (left and right of LED) ---
      const sidePanelGeo = new THREE.PlaneGeometry(4, 9);
      const sidePanelMatA = new THREE.MeshStandardMaterial({
        color: 0x0c0425,
        emissive: new THREE.Color(0x5b21b6),
        emissiveIntensity: status === "LIVE" ? 0.8 : 0.3,
        roughness: 0.4,
        metalness: 0.0,
      });
      const sidePanelMatB = new THREE.MeshStandardMaterial({
        color: 0x001a1a,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: status === "LIVE" ? 0.7 : 0.25,
        roughness: 0.4,
        metalness: 0.0,
      });
      const sidePanelA = new THREE.Mesh(sidePanelGeo, sidePanelMatA);
      sidePanelA.position.set(-15, 6.0, -8.4);
      scene.add(sidePanelA);
      const sidePanelB = new THREE.Mesh(sidePanelGeo, sidePanelMatB);
      sidePanelB.position.set(15, 6.0, -8.4);
      scene.add(sidePanelB);

      // --- TRUSS BARS (structural) ---
      const trussGeo = new THREE.BoxGeometry(32, 0.35, 0.35);
      const trussMat = new THREE.MeshStandardMaterial({ color: 0x1a1824, metalness: 0.9, roughness: 0.3 });
      for (let i = 0; i < 3; i++) {
        const truss = new THREE.Mesh(trussGeo, trussMat);
        truss.position.set(0, 12.5 + i * 1.2, -7.5 + i * 0.4);
        scene.add(truss);
      }

      // --- VERTICAL TRUSS PILLARS ---
      const pillarGeo = new THREE.BoxGeometry(0.3, 14, 0.3);
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1c1a28, metalness: 0.85, roughness: 0.35 });
      for (const x of [-14.5, -7, 0, 7, 14.5]) {
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.position.set(x, 7, -8.2);
        scene.add(p);
      }

      // --- SPEAKER CABINETS ---
      const speakerGeo = new THREE.BoxGeometry(2.2, 6, 2.2);
      const speakerMat = new THREE.MeshStandardMaterial({ color: 0x0a0a10, metalness: 0.4, roughness: 0.8 });
      for (const side of [-1, 1]) {
        const stack = new THREE.Mesh(speakerGeo, speakerMat);
        stack.position.set(side * 16, 3.1, -7);
        stack.castShadow = true;
        scene.add(stack);
        // Subwoofer at base
        const sub = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 2.6), speakerMat);
        sub.position.set(side * 16, 1.0, -7.1);
        scene.add(sub);
      }

      // --- CROWD SILHOUETTE ---
      const crowdGeo = new THREE.PlaneGeometry(60, 5);
      const crowdMat = new THREE.MeshBasicMaterial({
        color: 0x05050a,
        transparent: true,
        opacity: 0.85,
      });
      const crowd = new THREE.Mesh(crowdGeo, crowdMat);
      crowd.position.set(0, 2.5, -11);
      scene.add(crowd);

      // --- PARTICLES (floating light dust) ---
      const PARTICLE_COUNT = 320;
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const velocities = new Float32Array(PARTICLE_COUNT * 3);
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 1] = Math.random() * 18;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;
        velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.008;
        velocities[i * 3 + 1] = 0.004 + Math.random() * 0.006;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.004;
      }
      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particleMat = new THREE.PointsMaterial({
        color: status === "LIVE" ? 0xb78af7 : 0x6d5ea0,
        size: 0.09,
        transparent: true,
        opacity: status === "LIVE" ? 0.7 : 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const particles = new THREE.Points(particleGeo, particleMat);
      scene.add(particles);

      // --- LIGHTING ---
      const ambient = new THREE.AmbientLight(0x1a1830, 1.1);
      scene.add(ambient);

      const keyLight = new THREE.DirectionalLight(0xffffff, status === "LIVE" ? 1.1 : 0.6);
      keyLight.position.set(3, 18, 12);
      keyLight.castShadow = true;
      scene.add(keyLight);

      // Side A: deep purple wash
      const rimA = new THREE.PointLight(0x7c3aed, status === "LIVE" ? 2.8 : 1.2, 50);
      rimA.position.set(-13, 12, 8);
      scene.add(rimA);

      // Side B: electric cyan wash
      const rimB = new THREE.PointLight(0x00e5ff, status === "LIVE" ? 2.6 : 1.1, 50);
      rimB.position.set(13, 12, 8);
      scene.add(rimB);

      // Center: white/gold key
      const center = new THREE.PointLight(0xfff4e0, status === "LIVE" ? 1.2 : 0.5, 35);
      center.position.set(0, 10, 12);
      scene.add(center);

      // Stage floor uplights
      const upA = new THREE.PointLight(0x6d28d9, status === "LIVE" ? 1.5 : 0.4, 20);
      upA.position.set(-8, 0.5, 4);
      scene.add(upA);
      const upB = new THREE.PointLight(0x0891b2, status === "LIVE" ? 1.5 : 0.4, 20);
      upB.position.set(8, 0.5, 4);
      scene.add(upB);

      // --- SPOTLIGHT BEAMS ---
      const beamGeo = new THREE.ConeGeometry(5.0, 26, 48, 1, true);
      const makeBM = (col: number, opacity: number) =>
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });

      const beamConfigs = [
        { x: -11, col: 0x7c3aed, op: 0.075 },
        { x: -5.5, col: 0x9d4edd, op: 0.055 },
        { x: 0, col: 0xffffff, op: 0.035 },
        { x: 5.5, col: 0x0ea5e9, op: 0.055 },
        { x: 11, col: 0x00e5ff, op: 0.07 },
      ];

      const beams = beamConfigs.map(({ x, col, op }) => {
        const bm = makeBM(col, op);
        const b = new THREE.Mesh(beamGeo, bm);
        b.position.set(x, 17, 11);
        b.rotation.x = Math.PI;
        scene.add(b);
        return { mesh: b, mat: bm };
      });

      // --- CENTER VS DIVIDER BEAM ---
      const dividerGeo = new THREE.BoxGeometry(0.06, 18, 0.06);
      const dividerMat = new THREE.MeshBasicMaterial({
        color: 0xff1a1a,
        transparent: true,
        opacity: status === "LIVE" ? 0.55 : 0.15,
        blending: THREE.AdditiveBlending,
      });
      const divider = new THREE.Mesh(dividerGeo, dividerMat);
      divider.position.set(0, 9, -1);
      scene.add(divider);

      // Divider halo ring
      const haloGeo = new THREE.RingGeometry(0.8, 1.4, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff2244,
        transparent: true,
        opacity: status === "LIVE" ? 0.3 : 0.08,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(0, 4.5, 1.5);
      scene.add(halo);

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (!renderer) return;
        const { width, height } = canvas.getBoundingClientRect();
        if (width <= 0 || height <= 0) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      });
      ro.observe(canvas);

      // --- RENDER LOOP ---
      const reduced = prefersReducedMotion();
      const t0 = performance.now();

      const tick = () => {
        if (disposed) return;
        const t = (performance.now() - t0) / 1000;

        if (!reduced) {
          if (status === "LIVE") {
            // Animate beams
            beams.forEach((b, i) => {
              b.mesh.rotation.z = Math.sin(t * (0.4 + i * 0.12) + i) * 0.22;
            });

            // Pulse rim lights
            rimA.intensity = 2.2 + Math.sin(t * 1.4) * 0.55;
            rimB.intensity = 2.0 + Math.cos(t * 1.35) * 0.5;
            upA.intensity = 1.2 + Math.sin(t * 2.1) * 0.3;
            upB.intensity = 1.2 + Math.cos(t * 1.9) * 0.3;

            // Pulse LED backdrop
            if (ledMat instanceof THREE.MeshStandardMaterial) {
              ledMat.emissiveIntensity = 1.1 + Math.sin(t * 0.4) * 0.35;
            }
            if (sidePanelMatA instanceof THREE.MeshStandardMaterial) {
              sidePanelMatA.emissiveIntensity = 0.5 + Math.sin(t * 0.7 + 1) * 0.3;
            }
            if (sidePanelMatB instanceof THREE.MeshStandardMaterial) {
              sidePanelMatB.emissiveIntensity = 0.45 + Math.cos(t * 0.75 + 1) * 0.28;
            }

            // Divider pulse
            dividerMat.opacity = 0.35 + Math.abs(Math.sin(t * 1.8)) * 0.35;
            haloMat.opacity = 0.15 + Math.abs(Math.sin(t * 2.0)) * 0.18;
            halo.rotation.z = t * 0.5;

            // Particle drift
            const posAttr = particleGeo.getAttribute("position") as ThreeBufferAttribute;
            const pos = posAttr.array as Float32Array;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
              pos[i * 3 + 0] += velocities[i * 3 + 0];
              pos[i * 3 + 1] += velocities[i * 3 + 1];
              pos[i * 3 + 2] += velocities[i * 3 + 2];
              if (pos[i * 3 + 1] > 20) pos[i * 3 + 1] = 0;
            }
            posAttr.needsUpdate = true;

            // Camera very subtle drift
            camera.position.x = Math.sin(t * 0.08) * 0.6;
            camera.position.y = 8.5 + Math.sin(t * 0.12) * 0.2;
          } else {
            // Idle: gentle breathing only
            rimA.intensity = 1.0 + Math.sin(t * 0.5) * 0.15;
            rimB.intensity = 0.9 + Math.cos(t * 0.48) * 0.12;
          }
        }

        renderer!.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      cleanup = () => {
        ro.disconnect();
        cancelAnimationFrame(raf);
        renderer!.dispose();
        [
          floorGeo, riserGeo, ledGeo, sidePanelGeo, trussGeo, pillarGeo,
          speakerGeo, crowdGeo, particleGeo, beamGeo, dividerGeo, haloGeo,
        ].forEach((g) => g.dispose());
        [
          floorMat, riserMat, ledMat, sidePanelMatA, sidePanelMatB, trussMat,
          pillarMat, speakerMat, crowdMat, particleMat, dividerMat, haloMat,
        ].forEach((m) => m.dispose());
        beams.forEach((b) => b.mat.dispose());
      };
    })();

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [status]);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full opacity-75" />
      {/* Subtle theme watermark at top */}
      <div className="absolute inset-x-0 top-6 mx-auto max-w-6xl px-4 pointer-events-none">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <span
            className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] backdrop-blur ${
              status === "LIVE"
                ? "border-red-500/35 bg-red-950/40 text-red-300/80"
                : status === "COMPLETED"
                  ? "border-white/10 bg-black/30 text-white/35"
                  : "border-brand-500/25 bg-brand-950/30 text-brand-300/65"
            }`}
          >
            {status === "LIVE" ? "● On Stage Now" : status === "SCHEDULED" ? "Stage Set" : "Stage Closed"}
          </span>
          {labels.theme && (
            <span className="rounded-full border border-white/8 bg-black/25 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 backdrop-blur">
              {labels.theme}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
