"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionManager,
  ArcRotateCamera,
  Color3,
  ExecuteCodeAction,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";

type WorldItem = {
  id: string;
  title: string;
  artist: string;
  aiScore?: number;
  boostScore?: number;
  licensePrice?: string;
  revenueSharePct?: string;
  soldLicenses?: number;
  totalLicenses?: number;
};

type Avatar = {
  id: string;
  name: string;
  room?: string;
  x: number;
  z: number;
};

interface MarketplaceWorld3DProps {
  items: WorldItem[];
}

function makeClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ems-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function MarketplaceWorld3D({ items }: MarketplaceWorld3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [focused, setFocused] = useState<WorldItem | null>(items[0] ?? null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const clientId = useMemo(makeClientId, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setAvatars([
        { id: "demo-1", name: "Producer A", room: items[0]?.id, x: -4, z: 0 },
        { id: "demo-2", name: "A&R Scout", room: items[1]?.id, x: 2, z: -1 },
        { id: "demo-3", name: "Listener", room: items[2]?.id, x: 5, z: 1.5 },
      ]);
      return;
    }

    const channel = supabase.channel(`${CHANNELS.marketplace}:avatars`, {
      config: { presence: { key: clientId } },
    });

    const updatePresence = () => {
      const state = channel.presenceState() as Record<string, Array<Partial<Avatar>>>;
      const next = Object.entries(state).flatMap(([key, presences], index) =>
        presences.map((presence, presenceIndex) => ({
          id: `${key}-${presenceIndex}`,
          name: presence.name ?? `User ${index + 1}`,
          room: presence.room,
          x: typeof presence.x === "number" ? presence.x : -6 + index * 2,
          z: typeof presence.z === "number" ? presence.z : -2 + presenceIndex,
        })),
      );
      setAvatars(next);
    };

    channel.on("presence", { event: "sync" }, updatePresence);
    channel.on("presence", { event: "join" }, updatePresence);
    channel.on("presence", { event: "leave" }, updatePresence);
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          name: "Guest Artist",
          room: focused?.id ?? items[0]?.id,
          x: Math.random() * 10 - 5,
          z: Math.random() * 4 - 2,
        });
      }
    });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [clientId, focused?.id, items]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
    const scene = new Scene(engine);
    scene.clearColor = Color3.FromHexString("#050509").toColor4(1);

    const camera = new ArcRotateCamera("ems-camera", -Math.PI / 2, Math.PI / 2.45, 18, new Vector3(0, 2.3, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 28;
    camera.wheelDeltaPercentage = 0.01;

    const light = new HemisphericLight("ems-light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.88;

    const floor = MeshBuilder.CreateGround("studio-floor", { width: 30, height: 20, subdivisions: 8 }, scene);
    const floorMat = new StandardMaterial("floor-mat", scene);
    floorMat.diffuseColor = new Color3(0.02, 0.025, 0.045);
    floorMat.emissiveColor = new Color3(0.01, 0.025, 0.035);
    floor.material = floorMat;

    const wall = MeshBuilder.CreateBox("screen-wall", { width: 28, height: 8, depth: 0.25 }, scene);
    wall.position = new Vector3(0, 3.8, 6);
    const wallMat = new StandardMaterial("wall-mat", scene);
    wallMat.diffuseColor = new Color3(0.025, 0.025, 0.04);
    wallMat.emissiveColor = new Color3(0.015, 0.025, 0.04);
    wall.material = wallMat;

    const screenMat = new StandardMaterial("screen-mat", scene);
    screenMat.diffuseColor = new Color3(0.06, 0.07, 0.11);
    screenMat.emissiveColor = new Color3(0.04, 0.18, 0.22);
    const hotMat = new StandardMaterial("hot-screen-mat", scene);
    hotMat.diffuseColor = new Color3(0.10, 0.08, 0.14);
    hotMat.emissiveColor = new Color3(0.35, 0.16, 0.55);
    const adMat = new StandardMaterial("ad-billboard-mat", scene);
    adMat.diffuseColor = new Color3(0.12, 0.095, 0.02);
    adMat.emissiveColor = new Color3(0.55, 0.34, 0.06);
    const avatarMat = new StandardMaterial("avatar-mat", scene);
    avatarMat.diffuseColor = new Color3(0.08, 0.9, 0.95);
    avatarMat.emissiveColor = new Color3(0.02, 0.28, 0.32);

    const openTrack = (id: string) => {
      window.location.href = `/track/${id}`;
    };

    items.slice(0, 12).forEach((item, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = (col - 1.5) * 5.9;
      const y = 5.95 - row * 2.55;
      const z = 5.72;
      const screen = MeshBuilder.CreateBox(`screen-${item.id}`, { width: 4.7, height: 2.15, depth: 0.18 }, scene);
      screen.position = new Vector3(x, y, z);
      screen.material = index < 3 ? hotMat : screenMat;
      screen.actionManager = new ActionManager(scene);
      screen.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickTrigger, () => openTrack(item.id)));
      screen.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => setFocused(item)));

      const glow = MeshBuilder.CreateBox(`screen-glow-${item.id}`, { width: 5.05, height: 2.48, depth: 0.05 }, scene);
      glow.position = new Vector3(x, y, 5.64);
      const glowMat = new StandardMaterial(`glow-mat-${item.id}`, scene);
      glowMat.diffuseColor = new Color3(0, 0, 0);
      glowMat.emissiveColor = index < 3 ? new Color3(0.35, 0.22, 0.05) : new Color3(0.02, 0.18, 0.22);
      glowMat.alpha = 0.33;
      glow.material = glowMat;
    });

    avatars.slice(0, 10).forEach((avatar) => {
      const body = MeshBuilder.CreateCapsule(`avatar-${avatar.id}`, { height: 1.25, radius: 0.28 }, scene);
      body.position = new Vector3(avatar.x, 0.75, avatar.z);
      body.material = avatarMat;
    });

    const billboard = MeshBuilder.CreateBox("paid-placement-billboard", { width: 8, height: 1.1, depth: 0.12 }, scene);
    billboard.position = new Vector3(0, 0.9, 5.64);
    billboard.material = adMat;

    engine.runRenderLoop(() => {
      wall.rotation.y = Math.sin(Date.now() * 0.00035) * 0.015;
      billboard.scaling.x = 1 + Math.sin(Date.now() * 0.002) * 0.015;
      scene.render();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "w") camera.radius = Math.max(7, camera.radius - 0.8);
      if (event.key.toLowerCase() === "s") camera.radius = Math.min(28, camera.radius + 0.8);
      if (event.key.toLowerCase() === "a") camera.alpha -= 0.08;
      if (event.key.toLowerCase() === "d") camera.alpha += 0.08;
      if (event.key === "Enter" && focused) openTrack(focused.id);
    };
    const onResize = () => engine.resize();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      scene.dispose();
      engine.dispose();
    };
  }, [items, focused, avatars]);

  const remaining = focused?.totalLicenses && focused.soldLicenses !== undefined ? Math.max(focused.totalLicenses - focused.soldLicenses, 0) : null;

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/50 shadow-2xl shadow-black/60">
      <canvas ref={canvasRef} className="h-[460px] w-full touch-none" aria-label="Interactive 3D Epic Music Space marketplace studio" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-200">Babylon 3D World · Avatar layer</p>
        <p className="mt-1 text-sm text-white/60">Drag to orbit · W/A/S/D to move · Click screen to open track</p>
      </div>
      <div className="absolute right-4 top-4 rounded-xl border border-accent-300/25 bg-accent-300/10 px-4 py-3 text-right backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-100">Live avatars</p>
        <p className="mt-1 text-xs text-white/55">{avatars.length} in the studio</p>
      </div>
      <div className="absolute bottom-4 left-4 right-4 grid gap-3 rounded-2xl border border-white/10 bg-black/72 p-4 backdrop-blur md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Focused room</p>
          <p className="mt-1 truncate text-xl font-black text-white">{focused?.title ?? "Select a screen"}</p>
          <p className="truncate text-sm text-white/48">{focused?.artist ?? "Click a 3D screen to enter"}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold text-white/62">
          {focused?.licensePrice && <span className="rounded-full bg-white/10 px-3 py-1.5">{focused.licensePrice}</span>}
          {focused?.revenueSharePct && <span className="rounded-full bg-gold-400/10 px-3 py-1.5 text-gold-100">{focused.revenueSharePct}% share</span>}
          {remaining !== null && <span className="rounded-full bg-accent-400/10 px-3 py-1.5 text-accent-100">{remaining} left</span>}
        </div>
      </div>
      <div className="absolute bottom-28 left-4 max-w-xs rounded-xl border border-white/10 bg-black/60 p-3 backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">People nearby</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {avatars.slice(0, 5).map((avatar) => (
            <span key={avatar.id} className="rounded-full border border-accent-300/20 bg-accent-300/10 px-2.5 py-1 text-[11px] font-bold text-accent-100">{avatar.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
