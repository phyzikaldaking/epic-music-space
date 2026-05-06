"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  roomId: string;
  roomTitle: string;
  hostName: string;
}

type Channel = "copy" | "x" | "whatsapp" | "sms" | "native";

export default function ShareRoomButton({ roomId, roomTitle, hostName }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function getUrl() {
    if (typeof window === "undefined") return `https://epicmusicspace.com/rooms/${roomId}`;
    return `${window.location.origin}/rooms/${roomId}`;
  }

  function getMessage() {
    return `${hostName} is live in "${roomTitle}" on Epic Music Space — drop in:`;
  }

  async function share(channel: Channel) {
    const url = getUrl();
    const message = getMessage();
    const fullMessage = `${message} ${url}`;

    if (channel === "copy") {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        /* clipboard unavailable — fail silently */
      }
      return;
    }

    if (channel === "native" && navigator.share) {
      try {
        await navigator.share({ title: roomTitle, text: message, url });
      } catch {
        /* user dismissed */
      }
      setOpen(false);
      return;
    }

    let intent = "";
    if (channel === "x") {
      intent = `https://x.com/intent/tweet?text=${encodeURIComponent(fullMessage)}`;
    } else if (channel === "whatsapp") {
      intent = `https://wa.me/?text=${encodeURIComponent(fullMessage)}`;
    } else if (channel === "sms") {
      intent = `sms:?&body=${encodeURIComponent(fullMessage)}`;
    }

    if (intent) {
      window.open(intent, "_blank", "noopener,noreferrer");
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/4 px-3 py-2 text-sm font-semibold text-white/80 backdrop-blur transition hover:bg-white/10"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684 6.632 3.316m-6.632-6 6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
        Share
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-white/12 bg-[#0a0a0e]/95 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void share("copy")}
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/8"
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden>🔗</span> Copy link
            </span>
            {copied && <span className="text-xs text-emerald-300">Copied</span>}
          </button>
          {hasNativeShare && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void share("native")}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/8"
            >
              <span aria-hidden>📲</span> Share via…
            </button>
          )}
          <div className="my-1 border-t border-white/8" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void share("x")}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/8"
          >
            <span aria-hidden>𝕏</span> Post on X
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void share("whatsapp")}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/8"
          >
            <span aria-hidden>💬</span> WhatsApp
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void share("sms")}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/8"
          >
            <span aria-hidden>✉️</span> Text message
          </button>
        </div>
      )}
    </div>
  );
}
