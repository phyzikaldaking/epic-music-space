"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type EMSScene3DProps = {
  variant?: "intro" | "home" | "studio";
  className?: string;
  active?: boolean;
};

type ScenePalette = {
  primary: number;
  secondary: number;
  gold: number;
  fog: number;
  cameraZ: number;
  particleCount: number;
};

const palettes: Record<NonNullable<EMSScene3DProps["variant"]>, ScenePalette> = {
  intro: {
    primary: 0x22d3ee,
    secondary: 0xff2d92,
    gold: 0xfde047,
    fog: 0x020308,
    cameraZ: 7.2,
    particleCount: 760,
  },
  home: {
    primary: 0x67e8f9,
    secondary: 0xd946ef,
    gold: 0xfacc15,
    fog: 0x030307,
    cameraZ: 8.4,
    particleCount: 520,
  },
  studio: {
    primary: 0x5eead4,
    secondary: 0xfb7185,
    gold: 0xfbbf24,
    fog: 0x05070a,
    cameraZ: 9.2,
    particleCount: 420,
  },
};

function random(seed: number) {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

export default function EMSScene3D({ variant = "home", className = "", active = true }: EMSScene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const palette = palettes[variant];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(palette.fog, variant === "studio" ? 0.035 : 0.028);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
    camera.position.set(0, variant === "studio" ? 1.1 : 0.35, palette.cameraZ);

    const root = new THREE.Group();
    scene.add(root);

    const ambient = new THREE.AmbientLight(0xffffff, 0.58);
    scene.add(ambient);
    const cyanLight = new THREE.PointLight(palette.primary, 12, 18);
    cyanLight.position.set(-3.5, 2.5, 3);
    scene.add(cyanLight);
    const roseLight = new THREE.PointLight(palette.secondary, 10, 18);
    roseLight.position.set(3.2, -1.4, 2);
    scene.add(roseLight);

    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(palette.particleCount * 3);
    const particleColors = new Float32Array(palette.particleCount * 3);
    const colorA = new THREE.Color(palette.primary);
    const colorB = new THREE.Color(palette.secondary);
    const colorC = new THREE.Color(palette.gold);
    for (let i = 0; i < palette.particleCount; i += 1) {
      const radius = 2.2 + random(i + 4) * 10;
      const angle = random(i + 17) * Math.PI * 2;
      const y = (random(i + 31) - 0.5) * (variant === "studio" ? 5 : 7);
      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = Math.sin(angle) * radius - random(i + 43) * 10;
      const color = random(i + 55) > 0.72 ? colorC : random(i + 61) > 0.5 ? colorA : colorB;
      particleColors[i * 3] = color.r;
      particleColors[i * 3 + 1] = color.g;
      particleColors[i * 3 + 2] = color.b;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        size: variant === "intro" ? 0.035 : 0.026,
        vertexColors: true,
        transparent: true,
        opacity: variant === "studio" ? 0.46 : 0.72,
        depthWrite: false,
      }),
    );
    root.add(particles);

    const portal = new THREE.Group();
    root.add(portal);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: palette.primary, transparent: true, opacity: 0.44 });
    const ringMaterialB = new THREE.MeshBasicMaterial({ color: palette.secondary, transparent: true, opacity: 0.36 });
    const ringMaterialC = new THREE.MeshBasicMaterial({ color: palette.gold, transparent: true, opacity: 0.24 });
    for (let i = 0; i < 5; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.15 + i * 0.48, 0.012 + i * 0.002, 12, 160),
        i % 3 === 0 ? ringMaterial : i % 3 === 1 ? ringMaterialB : ringMaterialC,
      );
      ring.rotation.x = Math.PI / 2.8 + i * 0.09;
      ring.rotation.y = i * 0.16;
      ring.position.z = -i * 0.44;
      portal.add(ring);
    }

    const prism = new THREE.Mesh(
      new THREE.IcosahedronGeometry(variant === "studio" ? 0.48 : 0.72, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: palette.primary,
        emissiveIntensity: 0.42,
        metalness: 0.64,
        roughness: 0.18,
        transparent: true,
        opacity: variant === "studio" ? 0.52 : 0.88,
      }),
    );
    prism.position.y = variant === "studio" ? 0.8 : 0;
    portal.add(prism);

    const desk = new THREE.Group();
    desk.position.set(0, variant === "studio" ? -1.95 : -2.42, 0.9);
    desk.rotation.x = -0.32;
    root.add(desk);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x080b11,
      emissive: 0x071018,
      metalness: 0.72,
      roughness: 0.35,
      transparent: true,
      opacity: variant === "intro" ? 0.52 : 0.82,
    });
    const ledMaterial = new THREE.MeshBasicMaterial({ color: palette.primary, transparent: true, opacity: 0.68 });
    const roseLedMaterial = new THREE.MeshBasicMaterial({ color: palette.secondary, transparent: true, opacity: 0.62 });
    const consoleBase = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.16, 2.2), baseMaterial);
    desk.add(consoleBase);
    for (let i = 0; i < 42; i += 1) {
      const x = -3.55 + i * 0.17;
      const z = -0.82 + (i % 6) * 0.28;
      const height = 0.05 + random(i + 99) * 0.48;
      const meter = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, height, 0.03),
        i % 5 === 0 ? roseLedMaterial : ledMaterial,
      );
      meter.position.set(x, 0.12 + height / 2, z);
      desk.add(meter);
    }

    const grid = new THREE.GridHelper(18, 34, palette.primary, palette.secondary);
    grid.position.y = variant === "studio" ? -2.1 : -2.65;
    grid.position.z = -2.4;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = variant === "studio" ? 0.17 : 0.24;
    });
    root.add(grid);

    function resize() {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    let frame = 0;
    const clock = new THREE.Clock();
    function animate() {
      const t = clock.getElapsedTime();
      const motion = active && !reducedMotion;
      portal.rotation.z = motion ? t * (variant === "intro" ? 0.18 : 0.08) : 0.15;
      portal.rotation.y = motion ? Math.sin(t * 0.42) * 0.18 : 0.08;
      prism.rotation.x = motion ? t * 0.46 : 0.3;
      prism.rotation.y = motion ? t * 0.62 : 0.45;
      particles.rotation.y = motion ? t * 0.018 : 0;
      grid.position.z = (variant === "studio" ? -2.4 : -2.8) + (motion ? (t * 0.9) % 1 : 0);
      desk.children.forEach((child, index) => {
        if (index === 0) return;
        child.scale.y = motion ? 0.72 + Math.sin(t * 5.2 + index * 0.65) * 0.28 : 0.88;
      });
      renderer.render(scene, camera);
      if (motion) frame = requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener("resize", resize);
    animate();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      disposeObject(root);
      particleGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [active, variant]);

  return <div ref={mountRef} className={className} aria-hidden="true" />;
}
