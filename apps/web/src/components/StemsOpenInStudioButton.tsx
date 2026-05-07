"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Status = "NONE" | "QUEUED" | "PROCESSING" | "READY" | "FAILED";

interface StemsResponse {
  status: Status;
  stems?: { vocals: string; drums: string; bass: string; other: string };
  error?: string;
  access?: "artist" | "license_holder" | "admin" | "denied" | "song_not_found";
}

interface Props {
  songId: string;
  /**
   * The viewer must be either the artist of the track or hold an active
   * license to it. The server enforces this; this prop just decides
   * whether to render the button at all to avoid teasing access we'll
   * deny.
   */
  hasAccess: boolean;
}

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_DURATION_MS = 5 * 60_000; // give up the live poll after 5 min

export default function StemsOpenInStudioButton({ songId, hasAccess }: Props) {
  const [status, setStatus] = useState<Status>("NONE");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollStartRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/songs/${songId}/stems`, { cache: "no-store" });
    if (res.status === 401 || res.status === 403) {
      setStatus("NONE");
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as StemsResponse;
    setStatus(data.status);
    if (data.error) setError(data.error);
  }, [songId]);

  // Initial status read.
  useEffect(() => {
    if (!hasAccess) return;
    void fetchStatus();
  }, [hasAccess, fetchStatus]);

  // Live poll while a job is in flight.
  useEffect(() => {
    if (status !== "QUEUED" && status !== "PROCESSING") {
      pollStartRef.current = null;
      return;
    }
    if (pollStartRef.current === null) pollStartRef.current = Date.now();
    const tick = setInterval(() => {
      const started = pollStartRef.current ?? Date.now();
      if (Date.now() - started > POLL_MAX_DURATION_MS) {
        clearInterval(tick);
        return;
      }
      void fetchStatus();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(tick);
  }, [status, fetchStatus]);

  const startSeparation = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/stems/separate`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: Status;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Could not start separation (${res.status}).`);
        if (data.status) setStatus(data.status);
        return;
      }
      setStatus(data.status ?? "PROCESSING");
    } finally {
      setSubmitting(false);
    }
  }, [songId, submitting]);

  if (!hasAccess) return null;

  if (status === "READY") {
    return (
      <Link
        href={`/studio/board?stems=${songId}`}
        className="inline-flex items-center gap-2 rounded-xl border border-accent-500/40 bg-gradient-to-br from-accent-500/15 via-brand-500/10 to-transparent px-4 py-2 text-sm font-bold text-accent-100 transition hover:from-accent-500/25 hover:to-brand-500/20"
      >
        🎛 Open in Studio
      </Link>
    );
  }

  if (status === "QUEUED" || status === "PROCESSING") {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/75">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        Separating stems… <span className="text-white/40">~60s</span>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={startSeparation}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          ↻ Retry stem separation
        </button>
        {error && (
          <span className="text-xs text-amber-300/70 max-w-xs truncate" title={error}>
            {error}
          </span>
        )}
      </div>
    );
  }

  // NONE
  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={startSeparation}
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-xl border border-accent-500/40 bg-gradient-to-br from-accent-500/15 via-brand-500/10 to-transparent px-4 py-2 text-sm font-bold text-accent-100 transition hover:from-accent-500/25 hover:to-brand-500/20 disabled:opacity-50"
      >
        🎛 {submitting ? "Starting…" : "Open in Studio (split stems)"}
      </button>
      {error && (
        <span className="text-xs text-red-300/70 max-w-xs truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
