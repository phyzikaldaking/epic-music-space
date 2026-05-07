"use client";

/**
 * Resumes a guest publish after the visitor signed up.
 *
 * Flow: guest hits Publish in /studio/try → DAW stashes the WAV in
 * IndexedDB and bounces them through /auth/signup → on success they
 * land here at /studio/new?from=guest-resume. We pull the blob back
 * out, upload it via /api/upload (now authed), then redirect to
 * /studio/new?audioUrl=… so the existing QuickUploadFlow picks up
 * with the audio URL prefilled. The visitor never has to re-render
 * their mix.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readGuestMix, clearGuestMix, GUEST_RESUME_FLAG } from "@/lib/guestStash";

type Phase = "checking" | "no-stash" | "uploading" | "redirecting" | "error";

export default function GuestResumePublish() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try { window.localStorage.removeItem(GUEST_RESUME_FLAG); } catch { /* private */ }

      const entry = await readGuestMix().catch(() => null);
      if (!entry) {
        setPhase("no-stash");
        // No stash to resume — quietly drop the ?from=guest-resume param
        // so a refresh doesn't trip this again.
        router.replace("/studio/new");
        return;
      }

      setPhase("uploading");
      try {
        const signRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "audio",
            fileName: entry.fileName,
            mimeType: "audio/wav",
            fileSize: entry.blob.size,
          }),
        });
        const signJson = (await signRes.json().catch(() => ({}))) as {
          signedUrl?: string; publicUrl?: string; error?: string;
        };
        if (!signRes.ok || !signJson.signedUrl) {
          throw new Error(signJson.error ?? `Upload signing failed (${signRes.status})`);
        }
        const putRes = await fetch(signJson.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "audio/wav" },
          body: entry.blob,
        });
        if (!putRes.ok) {
          throw new Error(`Storage upload failed (${putRes.status})`);
        }
        const audioUrl = signJson.publicUrl ?? "";
        await clearGuestMix().catch(() => undefined);
        setPhase("redirecting");
        router.replace(`/studio/new?audioUrl=${encodeURIComponent(audioUrl)}&from=guest-resume-done`);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Upload failed");
        setPhase("error");
      }
    })();
  }, [router]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-brand-500/10 blur-[130px]" />
      <div className="relative">
        <div className="mb-5 text-5xl">{phase === "error" ? "⚠️" : "🎵"}</div>
        <h1 className="text-3xl font-extrabold">
          {phase === "checking" && "Looking for your mix…"}
          {phase === "uploading" && "Uploading your mix…"}
          {phase === "redirecting" && "Almost there…"}
          {phase === "no-stash" && "Welcome — let's publish"}
          {phase === "error" && "We hit a snag"}
        </h1>
        <p className="mt-3 text-sm text-white/65">
          {phase === "checking" && "Pulling the take you saved before signing up."}
          {phase === "uploading" && "We're sending the mix you cut as a guest to your account now. This takes a few seconds."}
          {phase === "redirecting" && "Mix uploaded — opening the publish form."}
          {phase === "no-stash" && "We didn't find a saved mix. Open the studio to make a fresh one or upload a track."}
          {phase === "error" && (
            <>
              {errorMsg}
              <br />
              <button
                type="button"
                onClick={() => location.reload()}
                className="mt-3 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                Try again
              </button>
            </>
          )}
        </p>
        {(phase === "uploading" || phase === "checking") && (
          <div className="mt-6 mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-white/8">
            <div className="h-full w-1/3 animate-[guestPulse_1.1s_ease-in-out_infinite] bg-gradient-to-r from-brand-500 to-accent-500" />
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes guestPulse {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
