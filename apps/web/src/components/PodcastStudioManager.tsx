"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PODCAST_CADENCES,
  PODCAST_FORMATS,
  PODCAST_EPISODE_STATUSES,
  formatPodcastEnum,
  slugifyPodcast,
} from "@/lib/podcast";

type EpisodeSummary = {
  id: string;
  title: string;
  slug: string;
  status: string;
  seasonNumber: number;
  episodeNumber: number;
  audioUrl: string | null;
  muxPlaybackId: string | null;
  videoStatus: string;
  publishedAt: string | null;
  viewCount: number;
  playCount: number;
  clipCount: number;
};

type ShowSummary = {
  id: string;
  title: string;
  slug: string;
  tagline: string | null;
  description: string;
  category: string | null;
  format: string;
  cadence: string;
  coverUrl: string | null;
  bannerUrl: string | null;
  isPublished: boolean;
  totalViews: number;
  episodes: EpisodeSummary[];
};

type Props = {
  initialShows: ShowSummary[];
};

const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/x-m4v,video/webm";
const AUDIO_ACCEPT = "audio/*,audio/mp4,audio/x-m4a,.mp3,.wav,.flac,.aac,.m4a,.aif,.aiff,.ogg,.oga,.opus,.webm";

export default function PodcastStudioManager({ initialShows }: Props) {
  const router = useRouter();
  const [shows, setShows] = useState(initialShows);
  const [showBusy, setShowBusy] = useState(false);
  const [episodeBusy, setEpisodeBusy] = useState(false);
  const [showError, setShowError] = useState<string | null>(null);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioUploadPct, setAudioUploadPct] = useState(0);
  const [videoUploadPct, setVideoUploadPct] = useState(0);

  const [showForm, setShowForm] = useState({
    title: "",
    tagline: "",
    description: "",
    category: "",
    format: "VIDEO",
    cadence: "WEEKLY",
    coverUrl: "",
    bannerUrl: "",
    trailerAudioUrl: "",
    isPublished: true,
  });

  const [episodeForm, setEpisodeForm] = useState({
    showId: initialShows[0]?.id ?? "",
    title: "",
    synopsis: "",
    seasonNumber: "1",
    episodeNumber: "1",
    status: "DRAFT",
    scheduledFor: "",
    audioUrl: "",
    coverUrl: "",
    muxUploadId: "",
    transcript: "",
    captionsUrl: "",
    durationSec: "",
    clipCount: "3",
  });

  const selectedShow = useMemo(
    () => shows.find((show) => show.id === episodeForm.showId) ?? shows[0] ?? null,
    [shows, episodeForm.showId],
  );

  async function refreshShows() {
    const res = await fetch("/api/podcast/shows?mine=1", { cache: "no-store" });
    const data = (await res.json().catch(() => ({ shows: [] }))) as { shows?: ShowSummary[] };
    if (res.ok && data.shows) {
      setShows(data.shows);
      if (!episodeForm.showId && data.shows[0]?.id) {
        setEpisodeForm((current) => ({ ...current, showId: data.shows?.[0]?.id ?? current.showId }));
      }
    }
  }

  async function uploadAudio(file: File) {
    setAudioUploading(true);
    setAudioUploadPct(0);
    setEpisodeError(null);
    try {
      const sig = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "audio",
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const sigData = (await sig.json()) as { signedUrl?: string; publicUrl?: string; error?: string };
      if (!sig.ok || !sigData.signedUrl || !sigData.publicUrl) {
        throw new Error(sigData.error ?? "Audio upload could not start.");
      }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sigData.signedUrl!);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setAudioUploadPct(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Audio upload failed.")));
        xhr.onerror = () => reject(new Error("Audio upload failed."));
        xhr.send(file);
      });
      setEpisodeForm((current) => ({ ...current, audioUrl: sigData.publicUrl ?? current.audioUrl }));
    } catch (error) {
      setEpisodeError(error instanceof Error ? error.message : "Audio upload failed.");
    } finally {
      setAudioUploading(false);
    }
  }

  async function uploadVideo(file: File) {
    setVideoUploading(true);
    setVideoUploadPct(0);
    setEpisodeError(null);
    try {
      const create = await fetch("/api/video/upload", { method: "POST" });
      const data = (await create.json()) as { uploadUrl?: string; uploadId?: string; error?: string };
      if (!create.ok || !data.uploadUrl || !data.uploadId) {
        throw new Error(data.error ?? "Video upload could not start.");
      }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", data.uploadUrl!);
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setVideoUploadPct(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Video upload failed.")));
        xhr.onerror = () => reject(new Error("Video upload failed."));
        xhr.send(file);
      });
      setEpisodeForm((current) => ({ ...current, muxUploadId: data.uploadId ?? current.muxUploadId }));
    } catch (error) {
      setEpisodeError(error instanceof Error ? error.message : "Video upload failed.");
    } finally {
      setVideoUploading(false);
    }
  }

  async function createShow(e: React.FormEvent) {
    e.preventDefault();
    setShowBusy(true);
    setShowError(null);
    const res = await fetch("/api/podcast/shows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(showForm),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
    setShowBusy(false);
    if (!res.ok) {
      setShowError(data.error ?? "Could not create show.");
      return;
    }
    setShowForm({
      title: "",
      tagline: "",
      description: "",
      category: "",
      format: "VIDEO",
      cadence: "WEEKLY",
      coverUrl: "",
      bannerUrl: "",
      trailerAudioUrl: "",
      isPublished: true,
    });
    await refreshShows();
    if (data.id) setEpisodeForm((current) => ({ ...current, showId: String(data.id) }));
  }

  async function createEpisode(e: React.FormEvent) {
    e.preventDefault();
    if (!episodeForm.showId) {
      setEpisodeError("Create a show first.");
      return;
    }
    setEpisodeBusy(true);
    setEpisodeError(null);
    const res = await fetch(`/api/podcast/shows/${episodeForm.showId}/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: episodeForm.title,
        synopsis: episodeForm.synopsis,
        seasonNumber: Number(episodeForm.seasonNumber),
        episodeNumber: Number(episodeForm.episodeNumber),
        status: episodeForm.status,
        scheduledFor: episodeForm.scheduledFor || null,
        audioUrl: episodeForm.audioUrl || null,
        coverUrl: episodeForm.coverUrl || null,
        muxUploadId: episodeForm.muxUploadId || null,
        transcript: episodeForm.transcript || null,
        captionsUrl: episodeForm.captionsUrl || null,
        durationSec: episodeForm.durationSec ? Number(episodeForm.durationSec) : null,
        clipCount: Number(episodeForm.clipCount || 0),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setEpisodeBusy(false);
    if (!res.ok) {
      setEpisodeError(data.error ?? "Could not create episode.");
      return;
    }
    setEpisodeForm((current) => ({
      ...current,
      title: "",
      synopsis: "",
      seasonNumber: "1",
      episodeNumber: String((Number(current.episodeNumber) || 1) + 1),
      status: "DRAFT",
      scheduledFor: "",
      audioUrl: "",
      coverUrl: "",
      muxUploadId: "",
      transcript: "",
      captionsUrl: "",
      durationSec: "",
      clipCount: "3",
    }));
    await refreshShows();
    router.refresh();
  }

  async function toggleShowPublished(showId: string, isPublished: boolean) {
    await fetch(`/api/podcast/shows/${showId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !isPublished }),
    });
    await refreshShows();
  }

  async function cycleEpisodeStatus(episodeId: string, status: string) {
    const next = status === "PUBLISHED" ? "ARCHIVED" : "PUBLISHED";
    await fetch(`/api/podcast/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await refreshShows();
  }

  return (
    <div className="mx-auto mt-8 max-w-6xl px-4 pb-16">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={createShow} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-200/75">Show Builder</p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.04em] text-white">Create your show</h2>
          <div className="mt-5 space-y-3">
            <input value={showForm.title} onChange={(e) => setShowForm((c) => ({ ...c, title: e.target.value }))} placeholder="Show title" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
            <input value={showForm.tagline} onChange={(e) => setShowForm((c) => ({ ...c, tagline: e.target.value }))} placeholder="Tagline" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
            <textarea value={showForm.description} onChange={(e) => setShowForm((c) => ({ ...c, description: e.target.value }))} placeholder="What is the show about?" rows={6} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={showForm.category} onChange={(e) => setShowForm((c) => ({ ...c, category: e.target.value }))} placeholder="Category" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
              <select title="Podcast format" value={showForm.format} onChange={(e) => setShowForm((c) => ({ ...c, format: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50">
                {PODCAST_FORMATS.map((value) => <option key={value} value={value}>{formatPodcastEnum(value)}</option>)}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={showForm.coverUrl} onChange={(e) => setShowForm((c) => ({ ...c, coverUrl: e.target.value }))} placeholder="Cover image URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
              <select title="Release cadence" value={showForm.cadence} onChange={(e) => setShowForm((c) => ({ ...c, cadence: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50">
                {PODCAST_CADENCES.map((value) => <option key={value} value={value}>{formatPodcastEnum(value)}</option>)}
              </select>
            </div>
            <input value={showForm.bannerUrl} onChange={(e) => setShowForm((c) => ({ ...c, bannerUrl: e.target.value }))} placeholder="Banner image URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
            <input value={showForm.trailerAudioUrl} onChange={(e) => setShowForm((c) => ({ ...c, trailerAudioUrl: e.target.value }))} placeholder="Trailer audio URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={showForm.isPublished} onChange={(e) => setShowForm((c) => ({ ...c, isPublished: e.target.checked }))} />
              Publish this show immediately
            </label>
            {showError && <p className="text-sm text-rose-300">{showError}</p>}
            <button disabled={showBusy || !showForm.title.trim() || !showForm.description.trim()} className="w-full rounded-2xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-white disabled:opacity-50">
              {showBusy ? "Creating..." : "Create show"}
            </button>
          </div>
        </form>

        <form onSubmit={createEpisode} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/75">Episode Builder</p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.04em] text-white">Package the next drop</h2>
          <div className="mt-5 space-y-3">
            <select title="Podcast show" value={episodeForm.showId} onChange={(e) => setEpisodeForm((c) => ({ ...c, showId: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
              <option value="">Select show</option>
              {shows.map((show) => <option key={show.id} value={show.id}>{show.title}</option>)}
            </select>
            {selectedShow && <p className="text-xs text-white/45">Publishing into {selectedShow.title}</p>}
            <input value={episodeForm.title} onChange={(e) => setEpisodeForm((c) => ({ ...c, title: e.target.value }))} placeholder="Episode title" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
            <textarea value={episodeForm.synopsis} onChange={(e) => setEpisodeForm((c) => ({ ...c, synopsis: e.target.value }))} placeholder="Episode summary, guest angle, headline thesis..." rows={5} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
            <div className="grid gap-3 sm:grid-cols-3">
              <input value={episodeForm.seasonNumber} onChange={(e) => setEpisodeForm((c) => ({ ...c, seasonNumber: e.target.value }))} placeholder="Season" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              <input value={episodeForm.episodeNumber} onChange={(e) => setEpisodeForm((c) => ({ ...c, episodeNumber: e.target.value }))} placeholder="Episode #" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              <select title="Episode status" value={episodeForm.status} onChange={(e) => setEpisodeForm((c) => ({ ...c, status: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                {PODCAST_EPISODE_STATUSES.map((status) => <option key={status} value={status}>{formatPodcastEnum(status)}</option>)}
              </select>
            </div>
            {episodeForm.status === "SCHEDULED" && (
              <input type="datetime-local" title="Scheduled publish time" placeholder="Schedule publish time" value={episodeForm.scheduledFor} onChange={(e) => setEpisodeForm((c) => ({ ...c, scheduledFor: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/78">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Upload audio</span>
                <input type="file" accept={AUDIO_ACCEPT} onChange={(e) => e.target.files?.[0] && void uploadAudio(e.target.files[0])} className="block w-full text-xs text-white/55" />
                {audioUploading && <span className="mt-2 block text-xs text-cyan-200">Uploading {audioUploadPct}%</span>}
              </label>
              <label className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/78">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Upload video</span>
                <input type="file" accept={VIDEO_ACCEPT} onChange={(e) => e.target.files?.[0] && void uploadVideo(e.target.files[0])} className="block w-full text-xs text-white/55" />
                {videoUploading && <span className="mt-2 block text-xs text-cyan-200">Uploading {videoUploadPct}%</span>}
              </label>
            </div>
            <input value={episodeForm.audioUrl} onChange={(e) => setEpisodeForm((c) => ({ ...c, audioUrl: e.target.value }))} placeholder="Audio URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
            <input value={episodeForm.muxUploadId} onChange={(e) => setEpisodeForm((c) => ({ ...c, muxUploadId: e.target.value }))} placeholder="Mux upload id" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
            <div className="grid gap-3 sm:grid-cols-3">
              <input value={episodeForm.coverUrl} onChange={(e) => setEpisodeForm((c) => ({ ...c, coverUrl: e.target.value }))} placeholder="Episode cover URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              <input value={episodeForm.captionsUrl} onChange={(e) => setEpisodeForm((c) => ({ ...c, captionsUrl: e.target.value }))} placeholder="Captions URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              <input value={episodeForm.durationSec} onChange={(e) => setEpisodeForm((c) => ({ ...c, durationSec: e.target.value }))} placeholder="Duration seconds" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
            </div>
            <input value={episodeForm.clipCount} onChange={(e) => setEpisodeForm((c) => ({ ...c, clipCount: e.target.value }))} placeholder="Planned clips" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
            <textarea value={episodeForm.transcript} onChange={(e) => setEpisodeForm((c) => ({ ...c, transcript: e.target.value }))} placeholder="Transcript or show notes" rows={6} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
            {episodeError && <p className="text-sm text-rose-300">{episodeError}</p>}
            <button disabled={episodeBusy || !episodeForm.title.trim() || !episodeForm.synopsis.trim() || !episodeForm.showId} className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-brand-500 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 disabled:opacity-50">
              {episodeBusy ? "Publishing..." : "Create episode"}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Control Room</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.04em] text-white">Your shows and episodes</h2>
          </div>
          <button type="button" onClick={() => void refreshShows()} className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/78">
            Refresh
          </button>
        </div>

        <div className="mt-6 space-y-5">
          {shows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-white/55">
              No shows yet. Create one above, then package your first episode.
            </div>
          ) : (
            shows.map((show) => (
              <div key={show.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-black text-white">{show.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] ${show.isPublished ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-white/50"}`}>
                        {show.isPublished ? "Live" : "Draft"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/55">/{show.slug} · {formatPodcastEnum(show.format)} · {formatPodcastEnum(show.cadence)}</p>
                    <p className="mt-2 text-sm text-white/65">{show.tagline || show.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void toggleShowPublished(show.id, show.isPublished)} className="rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/80">
                      {show.isPublished ? "Unpublish" : "Publish"}
                    </button>
                    <Link href={`/podcast/${show.slug}`} className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
                      View public page →
                    </Link>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Stat label="Episodes" value={String(show.episodes.length)} />
                  <Stat label="Total views" value={String(show.totalViews)} />
                  <Stat label="Suggested slug" value={slugifyPodcast(show.title)} />
                </div>

                <div className="mt-5 space-y-3">
                  {show.episodes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-4 text-sm text-white/50">
                      No episodes yet.
                    </div>
                  ) : (
                    show.episodes.map((episode) => (
                      <div key={episode.id} className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">S{episode.seasonNumber} · E{episode.episodeNumber} · {episode.title}</p>
                          <p className="mt-1 text-xs text-white/45">
                            {formatPodcastEnum(episode.status)} · views {episode.viewCount} · plays {episode.playCount} · clips {episode.clipCount}
                            {episode.videoStatus !== "NONE" ? ` · video ${episode.videoStatus.toLowerCase()}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void cycleEpisodeStatus(episode.id, episode.status)} className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/78">
                            {episode.status === "PUBLISHED" ? "Archive" : "Publish"}
                          </button>
                          <Link href={`/podcast/${show.slug}/${episode.slug}`} className="rounded-xl border border-brand-400/30 bg-brand-400/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-brand-100">
                            Open episode →
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}
