"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Persistent "tell us anything" floating chat. Sits bottom-right
// across every page; the user opens it, types, and submits. We
// route through /api/feedback which inserts the row and returns
// immediately — the LLM extraction (sentiment, feature, summary)
// happens out-of-band via the feedback-extract cron.
//
// We also expose a global event hook (`ems:open-feedback`) so other
// components — the post-record toast, the publish modal, the
// rap-market checkout success page — can throw open the widget
// with a pre-baked seed message ("How was that recording session?").

const STORAGE_KEY = "ems.feedback.dismissedAt.v1";

export default function FeedbackBotWidget() {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [seed, setSeed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  // Open / seed from cross-component events.
  useEffect(() => {
    function onOpen(e: Event) {
      const ce = e as CustomEvent<{ seed?: string; placeholder?: string }>;
      setSeed(ce.detail?.seed ?? null);
      setBody(ce.detail?.seed ?? "");
      setOpen(true);
      setSent(false);
      setError(null);
    }
    window.addEventListener("ems:open-feedback", onOpen as EventListener);
    return () =>
      window.removeEventListener("ems:open-feedback", onOpen as EventListener);
  }, []);

  // Keyboard shortcut: ⌘/Ctrl + Shift + F opens the widget. Doesn't
  // collide with browser-native shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "F" || e.key === "f")
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit() {
    const text = body.trim();
    if (text.length < 2) {
      setError("Type a bit more so we have something to read.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: text,
          pagePath: pathname ?? null,
          channel: seed ? "post-record" : "chat",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't send — try again.");
        return;
      }
      setSent(true);
      setBody("");
      setSeed(null);
      // Persist a "you sent feedback recently" stamp so we don't
      // re-nag right after.
      try {
        window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        /* private mode — ignore */
      }
      window.setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 2400);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open feedback chat"
        title="Tell us what's broken or missing (⌘⇧F)"
        className="fixed bottom-4 right-4 z-[140] flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/40 bg-black/85 text-xl shadow-lg shadow-black/40 transition hover:bg-amber-400/15"
      >
        💬
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[140] w-[min(96vw,360px)] rounded-2xl border border-amber-400/40 bg-zinc-950/95 p-4 shadow-2xl shadow-black/60 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">
            Feedback bot
          </div>
          <p className="mt-0.5 text-[11px] text-white/55">
            Tell us what&apos;s broken, missing, or worth keeping.
            Every message trains the platform.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/55 hover:bg-white/10"
          aria-label="Close feedback chat"
        >
          ✕
        </button>
      </div>
      {sent ? (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-center text-xs text-emerald-200">
          ✓ Got it — feeding it to the brain.
        </p>
      ) : (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 4000))}
            placeholder={seed ?? "What just happened? What would make this better?"}
            rows={4}
            className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
            autoFocus
          />
          <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-widest">
            <span className="text-white/40">{body.length}/4000</span>
            <span className="text-white/40">{pathname}</span>
          </div>
          {error && (
            <p className="mt-2 rounded-md border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-200">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={busy || body.trim().length < 2}
            className="mt-2 w-full rounded-md bg-amber-400 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-black hover:bg-amber-300 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send to the brain"}
          </button>
        </>
      )}
    </div>
  );
}

/** Imperative helper for callers that want to open the widget with
 *  a seed message ("How was that recording session?"). */
export function openFeedbackWithSeed(seed: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ems:open-feedback", { detail: { seed } }),
  );
}
