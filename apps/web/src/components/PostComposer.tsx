"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

interface MySong {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
}

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB
const ALLOWED_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];
const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);

type Mode = "idle" | "uploading" | "submitting";

export default function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoUploadId, setVideoUploadId] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const [mySongs, setMySongs] = useState<MySong[] | null>(null);
  const [showSongPicker, setShowSongPicker] = useState(false);

  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const hasMedia = !!imageUrl || !!videoUploadId || !!songId;
  const attachedSong = mySongs?.find((s) => s.id === songId) ?? null;

  // Lazy-load the artist's catalog once when they open the picker.
  useEffect(() => {
    if (!showSongPicker || mySongs !== null) return;
    void (async () => {
      try {
        const res = await fetch("/api/songs/list?mine=1&limit=50");
        if (!res.ok) {
          setMySongs([]);
          return;
        }
        const data = (await res.json()) as Array<{
          id: string;
          title: string;
          artist: string;
          coverUrl: string | null;
        }>;
        setMySongs(data.map((s) => ({ id: s.id, title: s.title, artist: s.artist, coverUrl: s.coverUrl })));
      } catch {
        setMySongs([]);
      }
    })();
  }, [showSongPicker, mySongs]);

  function reset() {
    setBody("");
    setImageUrl(null);
    setImagePreview(null);
    setVideoUploadId(null);
    setVideoFileName(null);
    setSongId(null);
    setShowSongPicker(false);
    setError(null);
    setProgress(0);
    setMode("idle");
    if (imageRef.current) imageRef.current.value = "";
    if (videoRef.current) videoRef.current.value = "";
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUploadId) {
      setError("Remove the video first to attach an image.");
      return;
    }
    if (songId) {
      setError("Remove the attached song first to attach an image.");
      return;
    }
    // Accept by MIME or extension — mobile cloud picks often have empty MIME.
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_IMAGE.includes(file.type) && !ALLOWED_IMAGE_EXTS.has(ext)) {
      setError("Image must be JPEG, PNG, WebP, GIF, or HEIC.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be under 10 MB.");
      return;
    }
    setError(null);
    setMode("uploading");
    setProgress(0);

    try {
      // Reuse the existing /api/upload flow with type=cover (10MB image bucket).
      const initRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cover",
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const initData = (await initRes.json()) as {
        signedUrl?: string;
        publicUrl?: string;
        error?: string;
      };
      if (!initRes.ok || !initData.signedUrl || !initData.publicUrl) {
        throw new Error(initData.error ?? "Upload init failed.");
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", initData.signedUrl!);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
      });

      setImageUrl(initData.publicUrl);
      setImagePreview(URL.createObjectURL(file));
      setMode("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
      setMode("idle");
    }
  }

  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imageUrl) {
      setError("Remove the image first to attach a video.");
      return;
    }
    if (songId) {
      setError("Remove the attached song first to attach a video.");
      return;
    }
    if (!ALLOWED_VIDEO.includes(file.type)) {
      setError("Video must be MP4, MOV, or WebM.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("Video must be under 500 MB.");
      return;
    }
    setError(null);
    setMode("uploading");
    setProgress(0);

    try {
      const initRes = await fetch("/api/video/upload", { method: "POST" });
      const initData = (await initRes.json()) as {
        uploadUrl?: string;
        uploadId?: string;
        error?: string;
      };
      if (!initRes.ok || !initData.uploadUrl || !initData.uploadId) {
        throw new Error(initData.error ?? "Video upload init failed.");
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", initData.uploadUrl!);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
      });

      setVideoUploadId(initData.uploadId);
      setVideoFileName(file.name);
      setMode("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed.");
      setMode("idle");
    }
  }

  async function handleSubmit() {
    if (mode !== "idle") return;
    const trimmed = body.trim();
    if (!trimmed && !hasMedia) {
      setError("Write something, or attach an image or video.");
      return;
    }
    if (!trimmed) {
      setError("Add a caption.");
      return;
    }
    setError(null);
    setMode("submitting");

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          imageUrl: imageUrl ?? undefined,
          muxUploadId: videoUploadId ?? undefined,
          songId: songId ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Post failed.");
      }
      reset();
      onPosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
      setMode("idle");
    }
  }

  return (
    <div className="glass rounded-2xl p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share an update, drop a clip…"
        rows={3}
        maxLength={2000}
        className="w-full resize-none rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
      />

      {imagePreview && (
        <div className="mt-3 relative inline-block">
          <Image
            src={imagePreview}
            alt="Attachment preview"
            width={300}
            height={200}
            unoptimized
            className="rounded-xl border border-white/10 max-h-60 w-auto object-contain"
          />
          <button
            type="button"
            onClick={() => {
              setImageUrl(null);
              setImagePreview(null);
              if (imageRef.current) imageRef.current.value = "";
            }}
            className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white hover:bg-black"
          >
            Remove
          </button>
        </div>
      )}

      {videoUploadId && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 p-3">
          <div className="text-2xl">🎬</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{videoFileName ?? "Video attached"}</p>
            <p className="text-xs text-white/40">Will encode after you post (usually under a minute).</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setVideoUploadId(null);
              setVideoFileName(null);
              if (videoRef.current) videoRef.current.value = "";
            }}
            className="rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10"
          >
            Remove
          </button>
        </div>
      )}

      {attachedSong && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 p-3">
          <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-brand-900">
            {attachedSong.coverUrl ? (
              <Image src={attachedSong.coverUrl} alt="" fill unoptimized className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg">🎵</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{attachedSong.title}</p>
            <p className="truncate text-xs text-white/40">{attachedSong.artist}</p>
          </div>
          <button
            type="button"
            onClick={() => setSongId(null)}
            className="rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10"
          >
            Remove
          </button>
        </div>
      )}

      {showSongPicker && !attachedSong && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-2">
          {mySongs === null ? (
            <p className="px-2 py-3 text-center text-xs text-white/40">Loading your tracks…</p>
          ) : mySongs.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-white/40">
              You haven&apos;t uploaded any tracks yet. <Link href="/studio/new" className="text-brand-400 hover:underline">Upload one →</Link>
            </p>
          ) : (
            <ul className="space-y-1">
              {mySongs.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSongId(s.id);
                      setShowSongPicker(false);
                      setError(null);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/8"
                  >
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-brand-900">
                      {s.coverUrl ? (
                        <Image src={s.coverUrl} alt="" fill unoptimized className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm">🎵</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{s.title}</p>
                      <p className="truncate text-[11px] text-white/40">{s.artist}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === "uploading" && (
        <div className="mt-3">
          <progress
            max={100}
            value={progress}
            className="ems-progress ems-progress-brand h-1.5 w-full"
            aria-label="Upload progress"
          />
          <p className="mt-1 text-xs text-white/50">Uploading… {progress}%</p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-xs hover:bg-white/10">
            📷 Photo
            <input
              ref={imageRef}
              type="file"
              accept={ALLOWED_IMAGE.join(",")}
              onChange={handleImage}
              disabled={mode !== "idle"}
              className="sr-only"
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-xs hover:bg-white/10">
            🎬 Video
            <input
              ref={videoRef}
              type="file"
              accept={ALLOWED_VIDEO.join(",")}
              onChange={handleVideo}
              disabled={mode !== "idle"}
              className="sr-only"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (imageUrl) {
                setError("Remove the image first to attach a track.");
                return;
              }
              if (videoUploadId) {
                setError("Remove the video first to attach a track.");
                return;
              }
              setError(null);
              setShowSongPicker((v) => !v);
            }}
            disabled={mode !== "idle"}
            className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-50 ${
              showSongPicker || attachedSong
                ? "border-brand-500/50 bg-brand-500/15 text-brand-200"
                : "border-white/10 bg-white/4 hover:bg-white/10"
            }`}
          >
            🎵 Track
          </button>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={mode !== "idle" || (!body.trim() && !hasMedia)}
          className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
        >
          {mode === "submitting" ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}
