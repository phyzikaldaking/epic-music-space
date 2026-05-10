"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_PODCAST_TEMPLATES,
  PODCAST_CADENCES,
  PODCAST_FORMATS,
  PODCAST_EPISODE_STATUSES,
  canTransitionPodcastPhase,
  derivePodcastBlockers,
  derivePodcastProductionState,
  formatPodcastEnum,
  slugifyPodcast,
  type PodcastTemplate,
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
  synopsis?: string | null;
  transcript?: string | null;
  captionsUrl?: string | null;
  coverUrl?: string | null;
  roomId?: string | null;
  muxUploadId?: string | null;
  scheduledFor?: string | null;
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
  /** True when the platform has LiveKit env vars set. When false, the
   *  Go Live buttons are disabled with an explanatory banner — clicking
   *  them otherwise runs a UI-only animation that misleads the user
   *  into thinking they're broadcasting. */
  liveKitOnline?: boolean;
};

type StudioPhase = "PRE_PRODUCTION" | "RECORDING" | "POST_PRODUCTION" | "PUBLISH";

type PipelineHealth = {
  summary: {
    totalChecked: number;
    failures: number;
    processing: number;
    stalled: number;
    healthy: number;
  };
  failed: Array<{ id: string; title: string }>;
  stalled: Array<{ id: string; title: string }>;
};

type StudioAnalytics = {
  summary: {
    totalViews: number;
    episodeCount: number;
    avgClipPerEpisode: number;
    viewToPlay: number;
    avgDurationSec: number;
  };
  recommendations: string[];
};

type StudioSession = {
  id: string;
  title: string;
  roomId: string | null;
  room: {
    id: string;
    title: string;
    status: string;
    sessionMode: string;
    participants: Array<{ userId: string; role: string }>;
  } | null;
};

type OnboardingSteps = {
  profileReady: boolean;
  firstShowCreated: boolean;
  firstEpisodeCreated: boolean;
  firstMediaAttached: boolean;
  firstPublish: boolean;
};

type OnboardingState = {
  steps: OnboardingSteps;
  progress: { completed: number; total: number; percent: number };
};

type DistributionPack = {
  episodeId: string;
  episodeTitle: string;
  releaseState: string;
  publishUrl: string;
  headline: string;
  hook: string;
  clipPlan: { target: number; available: number; recommendation: string };
  captionPlan: string;
  transcriptPlan: string;
  channelSequence: string[];
};

type MonetizationModel = {
  inputs: {
    sponsorSlots: number;
    cpmUsd: number;
    merchConversionPct: number;
    avgMerchOrderUsd: number;
    premiumUpsellPct: number;
    premiumPriceUsd: number;
  };
  revenue: {
    sponsor: number;
    merch: number;
    premium: number;
    monthly: number;
    perEpisode: number;
  };
  assumptions: string[];
};

type CollaboratorEntry = {
  id: string;
  title: string;
  room: {
    id: string;
    title: string;
    status: string;
    participants: Array<{ userId: string; role: string; user: { id: string; name: string | null; username: string | null } }>;
    timelineNotes: Array<{ id: string }>;
  } | null;
};

const PHASE_STEPS: Array<{ id: StudioPhase; label: string; hint: string }> = [
  { id: "PRE_PRODUCTION", label: "Pre-Production", hint: "Show setup and planning" },
  { id: "RECORDING", label: "Recording", hint: "Ingest and capture" },
  { id: "POST_PRODUCTION", label: "Post", hint: "Transcript, clips, polish" },
  { id: "PUBLISH", label: "Publish", hint: "Release and monitor" },
];

const STAGGER_ENTER = ["", "delay-75", "delay-100", "delay-150", "delay-200", "delay-300"] as const;

const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/x-m4v,video/webm";
const AUDIO_ACCEPT = "audio/*,audio/mp4,audio/x-m4a,.mp3,.wav,.flac,.aac,.m4a,.aif,.aiff,.ogg,.oga,.opus,.webm";

export default function PodcastStudioManager({ initialShows, liveKitOnline = false }: Props) {
  const router = useRouter();
  const [shows, setShows] = useState(initialShows);
  const [phase, setPhase] = useState<StudioPhase>("PRE_PRODUCTION");
  const [isLive, setIsLive] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [showBusy, setShowBusy] = useState(false);
  const [episodeBusy, setEpisodeBusy] = useState(false);
  const [showError, setShowError] = useState<string | null>(null);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioUploadPct, setAudioUploadPct] = useState(0);
  const [videoUploadPct, setVideoUploadPct] = useState(0);
  const [opBusy, setOpBusy] = useState(false);
  const [templates, setTemplates] = useState<PodcastTemplate[]>([...DEFAULT_PODCAST_TEMPLATES]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_PODCAST_TEMPLATES[0]?.id ?? "");
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [health, setHealth] = useState<PipelineHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<StudioAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [collabEntries, setCollabEntries] = useState<CollaboratorEntry[]>([]);
  const [collabLoading, setCollabLoading] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [distributionPacks, setDistributionPacks] = useState<DistributionPack[]>([]);
  const [distributionLoading, setDistributionLoading] = useState(false);
  const [distributionError, setDistributionError] = useState<string | null>(null);
  const [monetization, setMonetization] = useState<MonetizationModel | null>(null);
  const [monetizationLoading, setMonetizationLoading] = useState(false);
  const [monetizationError, setMonetizationError] = useState<string | null>(null);
  const [collabUserId, setCollabUserId] = useState("");
  const [collabEpisodeId, setCollabEpisodeId] = useState("");
  const [opMessage, setOpMessage] = useState<string | null>(null);
  const [checklist, setChecklist] = useState({
    runOfShow: false,
    guestAssets: false,
    levelsChecked: false,
    thumbnailsReady: false,
    clipsPlanned: false,
  });

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

  const selectedEpisode = useMemo(
    () => selectedShow?.episodes.find((episode) => episode.id === collabEpisodeId) ?? selectedShow?.episodes[0] ?? null,
    [selectedShow, collabEpisodeId],
  );

  const refreshShows = useCallback(async () => {
    const res = await fetch("/api/podcast/shows?mine=1", { cache: "no-store" });
    const data = (await res.json().catch(() => ({ shows: [] }))) as { shows?: ShowSummary[] };
    if (res.ok && data.shows) {
      setShows(data.shows);
      if (!episodeForm.showId && data.shows[0]?.id) {
        setEpisodeForm((current) => ({ ...current, showId: data.shows?.[0]?.id ?? current.showId }));
      }
    }
  }, [episodeForm.showId]);

  const phaseIndex = PHASE_STEPS.findIndex((step) => step.id === phase);

  const studioStats = useMemo(() => {
    const episodes = shows.flatMap((show) => show.episodes);
    const published = episodes.filter((episode) => episode.status === "PUBLISHED").length;
    const drafts = episodes.filter((episode) => episode.status === "DRAFT").length;
    const processing = episodes.filter((episode) => episode.videoStatus === "PROCESSING").length;
    const failed = episodes.filter((episode) => episode.videoStatus === "FAILED").length;
    return {
      shows: shows.length,
      episodes: episodes.length,
      published,
      drafts,
      processing,
      failed,
      totalViews: shows.reduce((acc, show) => acc + show.totalViews, 0),
    };
  }, [shows]);

  const actionQueue = useMemo(() => {
    const items: Array<{
      id: string;
      tone: "danger" | "warn" | "info";
      title: string;
      subtitle: string;
      href?: string;
      actionEpisodeId?: string;
      actionLabel?: string;
      actionType?: "retry_ingest" | "mark_transcript_ready" | "generate_clips" | "publish_now";
    }> = [];

    for (const show of shows) {
      for (const episode of show.episodes) {
        if (episode.videoStatus === "FAILED") {
          items.push({
            id: `failed-${episode.id}`,
            tone: "danger",
            title: `${show.title}: ${episode.title}`,
            subtitle: "Mux processing failed. Re-upload video or retry ingest.",
            href: `/podcast/${show.slug}/${episode.slug}`,
            actionEpisodeId: episode.id,
            actionLabel: "Retry",
            actionType: "retry_ingest",
          });
        }
        if (episode.videoStatus === "PROCESSING") {
          items.push({
            id: `processing-${episode.id}`,
            tone: "info",
            title: `${show.title}: ${episode.title}`,
            subtitle: "Video is processing. Keep transcript and clips ready.",
            href: `/podcast/${show.slug}/${episode.slug}`,
          });
        }
        if (episode.status === "DRAFT" && !episode.audioUrl && !episode.muxPlaybackId) {
          items.push({
            id: `media-${episode.id}`,
            tone: "warn",
            title: `${show.title}: ${episode.title}`,
            subtitle: "Draft has no media attached yet.",
            actionEpisodeId: episode.id,
            actionLabel: "Transcript",
            actionType: "mark_transcript_ready",
          });
        }
        if (episode.status === "PUBLISHED" && episode.clipCount < 3) {
          items.push({
            id: `clips-${episode.id}`,
            tone: "warn",
            title: `${show.title}: ${episode.title}`,
            subtitle: "Published with low clip count. Consider extra social cuts.",
            href: `/podcast/${show.slug}/${episode.slug}`,
            actionEpisodeId: episode.id,
            actionLabel: "Generate clips",
            actionType: "generate_clips",
          });
        }
        const blockers = derivePodcastBlockers(episode);
        if (episode.status !== "PUBLISHED" && blockers.length === 0 && derivePodcastProductionState(episode) === "READY") {
          items.push({
            id: `ready-${episode.id}`,
            tone: "info",
            title: `${show.title}: ${episode.title}`,
            subtitle: "Episode is ready. Publish when your slot opens.",
            actionEpisodeId: episode.id,
            actionLabel: "Publish now",
            actionType: "publish_now",
            href: `/podcast/${show.slug}/${episode.slug}`,
          });
        }
      }
    }

    return items.slice(0, 10);
  }, [shows]);

  const nextActions = useMemo(() => {
    const actions: Array<{ id: string; title: string; detail: string; phase: StudioPhase }> = [];
    if (onboarding && onboarding.progress.percent < 100) {
      if (!onboarding.steps.profileReady) actions.push({ id: "profile", title: "Complete studio profile", detail: "Add banner or bio to boost creator trust.", phase: "PRE_PRODUCTION" });
      if (!onboarding.steps.firstEpisodeCreated) actions.push({ id: "first-ep", title: "Ship your first episode", detail: "Create one episode to enter the weekly loop.", phase: "RECORDING" });
      if (!onboarding.steps.firstPublish) actions.push({ id: "publish", title: "Publish first release", detail: "Unlock audience feedback and analytics.", phase: "PUBLISH" });
    }
    if (distributionPacks.some((pack) => pack.clipPlan.available < 3)) {
      actions.push({ id: "clips", title: "Increase clip output", detail: "At least 3 clips per episode improves distribution reach.", phase: "POST_PRODUCTION" });
    }
    if (health?.summary.failures && health.summary.failures > 0) {
      actions.push({ id: "health", title: "Resolve pipeline failures", detail: "Fix failed ingest jobs before next release.", phase: "RECORDING" });
    }
    return actions.slice(0, 4);
    // React Compiler infers `health` (the whole object) as the actual
    // dependency; we previously listed `health?.summary.failures` which
    // is narrower than what the body uses. Widen to the whole object so
    // the compiler can preserve memoization.
  }, [distributionPacks, health, onboarding]);

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setLiveSeconds((current) => current + 1), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  useEffect(() => {
    if (!selectedShow?.id) return;
    let cancelled = false;

    async function loadOps() {
      setTemplatesLoading(true);
      setHealthLoading(true);
      setAnalyticsLoading(true);
      setSessionsLoading(true);
      setCollabLoading(true);
      setOnboardingLoading(true);
      setDistributionLoading(true);
      setMonetizationLoading(true);

      const [templatesRes, healthRes, analyticsRes, sessionsRes, collabRes, onboardingRes, distributionRes, monetizationRes] = await Promise.all([
        fetch(`/api/podcast/shows/${selectedShow.id}/templates`, { cache: "no-store" }),
        fetch(`/api/podcast/shows/${selectedShow.id}/health`, { cache: "no-store" }),
        fetch(`/api/podcast/shows/${selectedShow.id}/analytics`, { cache: "no-store" }),
        fetch(`/api/podcast/shows/${selectedShow.id}/sessions`, { cache: "no-store" }),
        fetch(`/api/podcast/shows/${selectedShow.id}/collab`, { cache: "no-store" }),
        fetch(`/api/podcast/shows/${selectedShow.id}/onboarding`, { cache: "no-store" }),
        fetch(`/api/podcast/shows/${selectedShow.id}/distribution`, { cache: "no-store" }),
        fetch(`/api/podcast/shows/${selectedShow.id}/monetization`, { cache: "no-store" }),
      ]);

      if (cancelled) return;
      const templatesData = (await templatesRes.json().catch(() => ({ templates: [] }))) as { templates?: PodcastTemplate[] };
      const healthData = (await healthRes.json().catch(() => null)) as PipelineHealth | null;
      const analyticsData = (await analyticsRes.json().catch(() => null)) as StudioAnalytics | null;
      const sessionsData = (await sessionsRes.json().catch(() => ({ sessions: [] }))) as { sessions?: StudioSession[] };
      const collabData = (await collabRes.json().catch(() => ({ episodes: [] }))) as { episodes?: CollaboratorEntry[] };
      const onboardingData = (await onboardingRes.json().catch(() => null)) as OnboardingState | null;
      const distributionData = (await distributionRes.json().catch(() => ({ packs: [] }))) as { packs?: DistributionPack[] };
      const monetizationData = (await monetizationRes.json().catch(() => null)) as MonetizationModel | null;

      if (templatesRes.ok) {
        if (templatesData.templates?.length) setTemplates(templatesData.templates);
        setTemplatesError(null);
      } else {
        setTemplatesError("Templates unavailable");
      }
      setTemplatesLoading(false);

      if (healthRes.ok && healthData) {
        setHealth(healthData);
        setHealthError(null);
      } else {
        setHealthError("Health check failed");
      }
      setHealthLoading(false);

      if (analyticsRes.ok && analyticsData) {
        setAnalytics(analyticsData);
        setAnalyticsError(null);
      } else {
        setAnalyticsError("Analytics unavailable");
      }
      setAnalyticsLoading(false);

      if (sessionsRes.ok && sessionsData.sessions) {
        setSessions(sessionsData.sessions);
        setSessionsError(null);
      } else {
        setSessionsError("Sessions unavailable");
      }
      setSessionsLoading(false);

      if (collabRes.ok && collabData.episodes) {
        setCollabEntries(collabData.episodes);
        setCollabError(null);
      } else {
        setCollabError("Collaboration data unavailable");
      }
      setCollabLoading(false);

      if (onboardingRes.ok && onboardingData) {
        setOnboarding(onboardingData);
        setOnboardingError(null);
      } else {
        setOnboardingError("Onboarding unavailable");
      }
      setOnboardingLoading(false);

      if (distributionRes.ok && distributionData.packs) {
        setDistributionPacks(distributionData.packs);
        setDistributionError(null);
      } else {
        setDistributionError("Distribution packs unavailable");
      }
      setDistributionLoading(false);

      if (monetizationRes.ok && monetizationData) {
        setMonetization(monetizationData);
        setMonetizationError(null);
      } else {
        setMonetizationError("Monetization model unavailable");
      }
      setMonetizationLoading(false);
    }

    void loadOps();
    const pollId = setInterval(() => {
      void loadOps();
      void refreshShows();
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [selectedShow?.id, refreshShows]);

  async function runEpisodeAction(episodeId: string, action: "retry_ingest" | "mark_transcript_ready" | "generate_clips" | "publish_now") {
    setOpBusy(true);
    setOpMessage(null);
    const previousShows = shows;

    setShows((current) =>
      current.map((show) => ({
        ...show,
        episodes: show.episodes.map((episode) => {
          if (episode.id !== episodeId) return episode;
          if (action === "retry_ingest") return { ...episode, videoStatus: "PROCESSING" };
          if (action === "mark_transcript_ready") return { ...episode, transcript: episode.transcript || "Transcript ready for review." };
          if (action === "generate_clips") return { ...episode, clipCount: Math.max(episode.clipCount, 3) };
          if (action === "publish_now") {
            return {
              ...episode,
              status: "PUBLISHED",
              publishedAt: episode.publishedAt || new Date().toISOString(),
            };
          }
          return episode;
        }),
      })),
    );

    const res = await fetch(`/api/podcast/episodes/${episodeId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; blockers?: string[] };
    setOpBusy(false);
    if (!res.ok) {
      setShows(previousShows);
      setOpMessage(data.error ?? "Action failed.");
      return;
    }
    setOpMessage("Action complete.");
    await refreshShows();
  }

  function requestPhaseChange(nextPhase: StudioPhase) {
    if (nextPhase !== "PUBLISH") {
      setPhase(nextPhase);
      return;
    }
    const candidate = selectedShow?.episodes[0] ?? null;
    const guard = canTransitionPodcastPhase("PUBLISH", candidate ?? {});
    if (!guard.ok) {
      setOpMessage(guard.reason);
      return;
    }
    setPhase(nextPhase);
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setShowForm((current) => ({
      ...current,
      format: template.format,
      cadence: template.cadence,
    }));
    setEpisodeForm((current) => ({
      ...current,
      clipCount: String(template.clipTarget),
    }));
  }

  async function toggleOnboardingStep(step: keyof OnboardingSteps) {
    if (!selectedShow?.id || !onboarding) return;
    const next = {
      ...onboarding.steps,
      [step]: !onboarding.steps[step],
    };
    setOnboarding((current) =>
      current
        ? {
            steps: next,
            progress: {
              completed: Object.values(next).filter(Boolean).length,
              total: Object.keys(next).length,
              percent: Math.round((Object.values(next).filter(Boolean).length / Object.keys(next).length) * 100),
            },
          }
        : current,
    );
    await fetch(`/api/podcast/shows/${selectedShow.id}/onboarding`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: next }),
    });
  }

  async function updateCollaboratorRole(episodeId: string, userId: string, role: "HOST" | "SPEAKER" | "LISTENER") {
    if (!selectedShow?.id) return;
    setOpBusy(true);
    const res = await fetch(`/api/podcast/shows/${selectedShow.id}/collab`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId, userId, role }),
    });
    setOpBusy(false);
    if (!res.ok) {
      setOpMessage("Could not update collaborator role.");
      return;
    }
    setOpMessage("Collaborator updated.");
  }

  async function removeCollaborator(episodeId: string, userId: string) {
    if (!selectedShow?.id) return;
    setOpBusy(true);
    const res = await fetch(`/api/podcast/shows/${selectedShow.id}/collab?episodeId=${encodeURIComponent(episodeId)}&userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    setOpBusy(false);
    if (!res.ok) {
      setOpMessage("Could not remove collaborator.");
      return;
    }
    setOpMessage("Collaborator removed.");
  }

  async function createSessionForEpisode() {
    if (!selectedShow?.id || !selectedEpisode?.id) {
      setOpMessage("Select an episode first.");
      return;
    }
    setOpBusy(true);
    const res = await fetch(`/api/podcast/shows/${selectedShow.id}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${selectedEpisode.title} Studio Session`,
        description: "Podcast production session",
        episodeId: selectedEpisode.id,
        mode: "A_AND_R",
        vibe: "MIDNIGHT",
      }),
    });
    setOpBusy(false);
    if (!res.ok) {
      setOpMessage("Could not create session.");
      return;
    }
    setOpMessage("Session created.");
    await refreshShows();
  }

  async function addCollaboratorToEpisode() {
    if (!selectedShow?.id || !selectedEpisode?.id || !collabUserId.trim()) {
      setOpMessage("Provide collaborator user id and episode.");
      return;
    }
    setOpBusy(true);
    const res = await fetch(`/api/podcast/shows/${selectedShow.id}/collab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: selectedEpisode.id, userId: collabUserId.trim(), role: "SPEAKER" }),
    });
    setOpBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setOpMessage(data.error ?? "Could not add collaborator.");
      return;
    }
    setCollabUserId("");
    setOpMessage("Collaborator added.");
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

  function formatLiveClock(seconds: number) {
    const hrs = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const mins = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  }

  function staggerClass(index: number) {
    return STAGGER_ENTER[Math.min(index, STAGGER_ENTER.length - 1)];
  }

  function progressWidthClass(percent: number) {
    if (percent >= 100) return "w-full";
    if (percent >= 90) return "w-[90%]";
    if (percent >= 80) return "w-[80%]";
    if (percent >= 70) return "w-[70%]";
    if (percent >= 60) return "w-[60%]";
    if (percent >= 50) return "w-1/2";
    if (percent >= 40) return "w-[40%]";
    if (percent >= 30) return "w-[30%]";
    if (percent >= 20) return "w-1/5";
    if (percent >= 10) return "w-[10%]";
    return "w-[4%]";
  }

  return (
    <div className="mx-auto mt-8 max-w-7xl px-4 pb-36 md:pb-16">
      {!liveKitOnline && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/8 px-5 py-4 text-sm text-amber-100 backdrop-blur-md">
          <span aria-hidden className="text-lg">📹</span>
          <div className="flex-1">
            <p className="font-bold text-amber-200">
              Live broadcast isn&apos;t switched on yet — Go Live is disabled.
            </p>
            <p className="mt-0.5 text-xs text-amber-100/75">
              Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL in your Vercel environment, redeploy, and the Go Live buttons unlock. Episode planning, uploads, transcripts, and clips all still work without it.
            </p>
            <a
              href="https://livekit.io/cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-200 underline decoration-dotted underline-offset-2 hover:text-white"
            >
              Get LiveKit credentials →
            </a>
          </div>
        </div>
      )}
      <div className="relative z-20 overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(120%_140%_at_10%_0%,rgba(56,189,248,0.12),transparent_45%),radial-gradient(90%_90%_at_100%_0%,rgba(244,63,94,0.12),transparent_55%),rgba(3,7,18,0.86)] p-5 shadow-[0_30px_80px_rgba(15,23,42,0.45)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.06)_35%,transparent_70%)] opacity-60 [mask-image:radial-gradient(circle_at_top,black,transparent_72%)]" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Studio Transport</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.04em] text-white">Live Operations Deck</h2>
            <p className="mt-2 text-sm text-white/60">Switch between planning, recording, post, and release without leaving the control surface.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${isLive ? "animate-pulse bg-rose-500/25 text-rose-100" : "bg-white/10 text-white/55"}`}>
              {isLive ? "ON AIR" : "STANDBY"}
            </span>
            <span className="rounded-full border border-white/12 bg-black/35 px-3 py-1 font-mono text-sm text-cyan-100">
              {formatLiveClock(liveSeconds)}
            </span>
            <div className="hidden items-end gap-1 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 md:flex">
              {[1, 2, 3, 4].map((bar) => (
                <span
                  key={bar}
                  className={`h-3 w-1 rounded-full ${
                    isLive
                      ? `animate-pulse bg-cyan-300 ${bar === 1 ? "opacity-45" : bar === 2 ? "opacity-60" : bar === 3 ? "opacity-80" : "opacity-100"}`
                      : "bg-white/30 opacity-35"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsLive((current) => !current)}
              disabled={!liveKitOnline}
              title={liveKitOnline ? undefined : "Configure LiveKit (LIVEKIT_API_KEY / LIVEKIT_API_SECRET / NEXT_PUBLIC_LIVEKIT_URL) to enable live broadcast."}
              className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-50 ${isLive ? "bg-rose-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.45)]" : "bg-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(56,189,248,0.35)]"}`}
            >
              {isLive ? "Stop" : "Go Live"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLive(false);
                setLiveSeconds(0);
              }}
              className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/80"
            >
              Reset Clock
            </button>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Production Rail</p>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/70">Phase {phaseIndex + 1} / {PHASE_STEPS.length}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PHASE_STEPS.map((step, index) => {
              const isActive = step.id === phase;
              const completed = index < phaseIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => requestPhaseChange(step.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    isActive
                      ? "border-cyan-300/55 bg-cyan-400/15"
                      : completed
                        ? "border-emerald-300/35 bg-emerald-500/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20"
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white">{step.label}</p>
                  <p className="mt-0.5 text-[10px] text-white/50">{step.hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <aside className="order-2 space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.28)] sm:p-5 xl:order-1">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Production Phases</p>
            <div className="mt-3 space-y-2">
              {PHASE_STEPS.map((phaseOption, index) => {
                const active = phase === phaseOption.id;
                return (
                  <button
                    key={phaseOption.id}
                    type="button"
                    onClick={() => requestPhaseChange(phaseOption.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-cyan-300/55 bg-cyan-400/15 shadow-[0_10px_30px_rgba(56,189,248,0.2)]"
                        : "border-white/10 bg-black/25 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]"
                    } ${staggerClass(index)}`}
                  >
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-white">{phaseOption.label}</p>
                    <p className="mt-1 text-[11px] text-white/55">{phaseOption.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Studio Metrics</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="Shows" value={String(studioStats.shows)} />
              <MiniStat label="Episodes" value={String(studioStats.episodes)} />
              <MiniStat label="Published" value={String(studioStats.published)} />
              <MiniStat label="Drafts" value={String(studioStats.drafts)} />
              <MiniStat label="In Process" value={String(studioStats.processing)} />
              <MiniStat label="Failures" value={String(studioStats.failed)} tone={studioStats.failed > 0 ? "danger" : "default"} />
            </div>
            <p className="mt-3 text-xs text-white/55">Total audience views: <span className="font-black text-white">{studioStats.totalViews}</span></p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Show Roster</p>
            <div className="mt-2 space-y-2">
              {shows.length === 0 ? (
                <p className="text-xs text-white/55">No shows yet.</p>
              ) : (
                shows.slice(0, 5).map((show) => (
                  <button
                    key={show.id}
                    type="button"
                    onClick={() => setEpisodeForm((current) => ({ ...current, showId: show.id }))}
                    className={`w-full rounded-xl border px-3 py-2 text-left ${
                      show.id === episodeForm.showId ? "border-cyan-300/50 bg-cyan-400/10" : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <p className="truncate text-xs font-semibold text-white">{show.title}</p>
                    <p className="mt-0.5 text-[11px] text-white/50">{show.episodes.length} eps · {show.isPublished ? "Live" : "Draft"}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="order-1 min-w-0 space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_60px_rgba(2,6,23,0.28)] sm:p-6 xl:order-2">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-cyan-300/35">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Active Session</p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-[0.04em] text-white">
                  {selectedShow ? selectedShow.title : "No show selected"}
                </h3>
                <p className="mt-1 text-sm text-white/55">
                  {selectedShow
                    ? `${formatPodcastEnum(selectedShow.format)} · ${formatPodcastEnum(selectedShow.cadence)} · ${selectedShow.episodes.length} episodes`
                    : "Create your first show to open a production session."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void refreshShows()} className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/80 transition hover:-translate-y-0.5 hover:border-cyan-300/35">
                  Sync Room
                </button>
                {selectedShow && (
                  <Link href={`/podcast/${selectedShow.slug}`} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100 transition hover:-translate-y-0.5 hover:bg-cyan-400/20">
                    Open Public Page →
                  </Link>
                )}
              </div>
            </div>
            {opMessage && <p className="mt-3 text-xs font-semibold text-cyan-100/85">{opMessage}</p>}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Next Best Actions</p>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/70">Loop Driver</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {nextActions.length === 0 ? (
                <p className="text-xs text-white/55">No blockers detected. Keep shipping this week’s episode cadence.</p>
              ) : (
                nextActions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => requestPhaseChange(item.phase)}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-cyan-300/35"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-white">{item.title}</p>
                    <p className="mt-1 text-[11px] text-white/60">{item.detail}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {phase === "PRE_PRODUCTION" && (
            <form onSubmit={createShow} className="animate-[fadeIn_280ms_ease-out] rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-200/75">Pre-Production</p>
              <h3 className="mt-2 text-xl font-black uppercase tracking-[0.04em] text-white">Design a new show format</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <select
                  title="Podcast template"
                  value={selectedTemplateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => applyTemplate(selectedTemplateId)}
                  className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white/80"
                >
                  Apply Template
                </button>
              </div>
              {templatesLoading && <p className="mt-2 text-[11px] text-cyan-100/80">Loading templates...</p>}
              {templatesError && <p className="mt-2 text-[11px] text-rose-200">{templatesError}</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input value={showForm.title} onChange={(e) => setShowForm((c) => ({ ...c, title: e.target.value }))} placeholder="Show title" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
                <input value={showForm.tagline} onChange={(e) => setShowForm((c) => ({ ...c, tagline: e.target.value }))} placeholder="Tagline" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
                <textarea value={showForm.description} onChange={(e) => setShowForm((c) => ({ ...c, description: e.target.value }))} placeholder="What is the show about?" rows={5} className="sm:col-span-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
                <input value={showForm.category} onChange={(e) => setShowForm((c) => ({ ...c, category: e.target.value }))} placeholder="Category" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
                <select title="Podcast format" value={showForm.format} onChange={(e) => setShowForm((c) => ({ ...c, format: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50">
                  {PODCAST_FORMATS.map((value) => <option key={value} value={value}>{formatPodcastEnum(value)}</option>)}
                </select>
                <input value={showForm.coverUrl} onChange={(e) => setShowForm((c) => ({ ...c, coverUrl: e.target.value }))} placeholder="Cover image URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
                <select title="Release cadence" value={showForm.cadence} onChange={(e) => setShowForm((c) => ({ ...c, cadence: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50">
                  {PODCAST_CADENCES.map((value) => <option key={value} value={value}>{formatPodcastEnum(value)}</option>)}
                </select>
                <input value={showForm.bannerUrl} onChange={(e) => setShowForm((c) => ({ ...c, bannerUrl: e.target.value }))} placeholder="Banner image URL" className="sm:col-span-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
                <input value={showForm.trailerAudioUrl} onChange={(e) => setShowForm((c) => ({ ...c, trailerAudioUrl: e.target.value }))} placeholder="Trailer audio URL" className="sm:col-span-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50" />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={showForm.isPublished} onChange={(e) => setShowForm((c) => ({ ...c, isPublished: e.target.checked }))} />
                Publish this show immediately
              </label>
              {showError && <p className="mt-3 text-sm text-rose-300">{showError}</p>}
              <button disabled={showBusy || !showForm.title.trim() || !showForm.description.trim()} className="mt-4 rounded-2xl bg-gradient-to-r from-brand-500 to-accent-500 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white disabled:opacity-50">
                {showBusy ? "Creating..." : "Create show"}
              </button>
            </form>
          )}

          {phase === "RECORDING" && (
            <form onSubmit={createEpisode} className="animate-[fadeIn_280ms_ease-out] rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/75">Recording & Ingest</p>
              <h3 className="mt-2 text-xl font-black uppercase tracking-[0.04em] text-white">Capture and package the next episode</h3>
              <div className="mt-4 space-y-3">
                <select title="Podcast show" value={episodeForm.showId} onChange={(e) => setEpisodeForm((c) => ({ ...c, showId: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                  <option value="">Select show</option>
                  {shows.map((show) => <option key={show.id} value={show.id}>{show.title}</option>)}
                </select>
                {selectedShow && <p className="text-xs text-white/45">Routing episode to {selectedShow.title}</p>}
                <input value={episodeForm.title} onChange={(e) => setEpisodeForm((c) => ({ ...c, title: e.target.value }))} placeholder="Episode title" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
                <textarea value={episodeForm.synopsis} onChange={(e) => setEpisodeForm((c) => ({ ...c, synopsis: e.target.value }))} placeholder="Episode summary, guest angle, headline thesis..." rows={4} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
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

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-white/78">
                    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100/70">Audio ingest</span>
                    <input type="file" accept={AUDIO_ACCEPT} onChange={(e) => e.target.files?.[0] && void uploadAudio(e.target.files[0])} className="block w-full text-xs text-white/65" />
                    {audioUploading && <span className="mt-2 block text-xs text-cyan-200">Uploading {audioUploadPct}%</span>}
                  </label>
                  <label className="rounded-2xl border border-brand-400/20 bg-brand-400/5 px-4 py-3 text-sm text-white/78">
                    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-brand-100/70">Video ingest</span>
                    <input type="file" accept={VIDEO_ACCEPT} onChange={(e) => e.target.files?.[0] && void uploadVideo(e.target.files[0])} className="block w-full text-xs text-white/65" />
                    {videoUploading && <span className="mt-2 block text-xs text-brand-100">Uploading {videoUploadPct}%</span>}
                  </label>
                </div>

                <input value={episodeForm.audioUrl} onChange={(e) => setEpisodeForm((c) => ({ ...c, audioUrl: e.target.value }))} placeholder="Audio URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
                <input value={episodeForm.muxUploadId} onChange={(e) => setEpisodeForm((c) => ({ ...c, muxUploadId: e.target.value }))} placeholder="Mux upload id" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              </div>
              {episodeError && <p className="mt-3 text-sm text-rose-300">{episodeError}</p>}
              <button disabled={episodeBusy || !episodeForm.title.trim() || !episodeForm.synopsis.trim() || !episodeForm.showId} className="mt-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-brand-500 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 disabled:opacity-50">
                {episodeBusy ? "Publishing..." : "Create episode"}
              </button>
            </form>
          )}

          {phase === "POST_PRODUCTION" && (
            <div className="animate-[fadeIn_280ms_ease-out] rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-200/75">Post-Production</p>
              <h3 className="mt-2 text-xl font-black uppercase tracking-[0.04em] text-white">Finalize assets and polish release</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <input value={episodeForm.coverUrl} onChange={(e) => setEpisodeForm((c) => ({ ...c, coverUrl: e.target.value }))} placeholder="Episode cover URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
                <input value={episodeForm.captionsUrl} onChange={(e) => setEpisodeForm((c) => ({ ...c, captionsUrl: e.target.value }))} placeholder="Captions URL" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
                <input value={episodeForm.durationSec} onChange={(e) => setEpisodeForm((c) => ({ ...c, durationSec: e.target.value }))} placeholder="Duration seconds" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              </div>
              <input value={episodeForm.clipCount} onChange={(e) => setEpisodeForm((c) => ({ ...c, clipCount: e.target.value }))} placeholder="Planned clips" className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              <textarea value={episodeForm.transcript} onChange={(e) => setEpisodeForm((c) => ({ ...c, transcript: e.target.value }))} placeholder="Transcript or show notes" rows={7} className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              <p className="mt-3 text-xs text-white/50">Save these into the next episode creation or copy into your current release checklist.</p>
            </div>
          )}

          {phase === "PUBLISH" && (
            <div className="animate-[fadeIn_280ms_ease-out] rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-200/75">Release Deck</p>
              <h3 className="mt-2 text-xl font-black uppercase tracking-[0.04em] text-white">Publish rail and audience controls</h3>
              <div className="mt-4 space-y-4">
                {shows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-white/55">
                    No shows yet. Move to Pre-Production to create your first format.
                  </div>
                ) : (
                  shows.map((show) => (
                    <div key={show.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/30">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-base font-black text-white">{show.title}</p>
                          <p className="text-xs text-white/50">/{show.slug} · {formatPodcastEnum(show.format)} · {formatPodcastEnum(show.cadence)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void toggleShowPublished(show.id, show.isPublished)} className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/78">
                            {show.isPublished ? "Unpublish" : "Publish"}
                          </button>
                          <Link href={`/podcast/${show.slug}`} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100">
                            View public page →
                          </Link>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <Stat label="Episodes" value={String(show.episodes.length)} />
                        <Stat label="Total views" value={String(show.totalViews)} />
                        <Stat label="Suggested slug" value={slugifyPodcast(show.title)} />
                      </div>

                      <div className="mt-4 space-y-3">
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
          )}
        </main>

        <aside className="order-3 space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.28)] sm:p-5">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Creator Activation</p>
            {onboardingLoading && <p className="mt-2 text-[11px] text-cyan-100/80">Checking onboarding...</p>}
            {onboardingError && <p className="mt-2 text-[11px] text-rose-200">{onboardingError}</p>}
            {onboarding && (
              <>
                <p className="mt-2 text-xs text-white/70">Progress: {onboarding.progress.percent}% ({onboarding.progress.completed}/{onboarding.progress.total})</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full bg-cyan-300 transition-all ${progressWidthClass(onboarding.progress.percent)}`} />
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {[
                    ["profileReady", "Profile ready"],
                    ["firstShowCreated", "First show created"],
                    ["firstEpisodeCreated", "First episode created"],
                    ["firstMediaAttached", "Media attached"],
                    ["firstPublish", "First publish"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-white/80">
                      <input
                        type="checkbox"
                        checked={Boolean(onboarding.steps[key as keyof OnboardingSteps])}
                        onChange={() => void toggleOnboardingStep(key as keyof OnboardingSteps)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Session Ops</p>
            <p className="mt-1 text-[11px] text-white/55">Record and coordinate episode sessions with collaborators.</p>
            {sessionsLoading && <p className="mt-2 text-[11px] text-cyan-100/80">Syncing sessions...</p>}
            {sessionsError && <p className="mt-2 text-[11px] text-rose-200">{sessionsError}</p>}
            <div className="mt-3 grid gap-2">
              <select
                title="Episode session target"
                value={selectedEpisode?.id ?? ""}
                onChange={(e) => setCollabEpisodeId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
              >
                <option value="">Select episode</option>
                {(selectedShow?.episodes ?? []).map((episode) => (
                  <option key={episode.id} value={episode.id}>{episode.title}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={opBusy || !selectedEpisode}
                onClick={() => void createSessionForEpisode()}
                className="rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-100 disabled:opacity-60"
              >
                Create Session
              </button>
              <input
                value={collabUserId}
                onChange={(e) => setCollabUserId(e.target.value)}
                placeholder="Collaborator user id"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                disabled={opBusy || !selectedEpisode || !collabUserId.trim()}
                onClick={() => void addCollaboratorToEpisode()}
                className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/80 disabled:opacity-60"
              >
                Add Collaborator
              </button>
            </div>
            <div className="mt-3 space-y-1">
              {sessions.slice(0, 3).map((sessionItem) => (
                <p key={sessionItem.id} className="text-[11px] text-white/65">{sessionItem.title} · {sessionItem.room?.status ?? "No room"}</p>
              ))}
              {sessions.length === 0 && <p className="text-[11px] text-white/50">No sessions linked yet.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Distribution Automation</p>
            {distributionLoading && <p className="mt-2 text-[11px] text-cyan-100/80">Building distribution packs...</p>}
            {distributionError && <p className="mt-2 text-[11px] text-rose-200">{distributionError}</p>}
            <div className="mt-2 space-y-2">
              {distributionPacks.slice(0, 2).map((pack) => (
                <div key={pack.episodeId} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white">{pack.episodeTitle}</p>
                  <p className="mt-1 text-[11px] text-white/60">{pack.headline}</p>
                  <p className="mt-1 text-[11px] text-white/55">{pack.clipPlan.recommendation}</p>
                </div>
              ))}
              {!distributionLoading && distributionPacks.length === 0 && <p className="text-[11px] text-white/50">No distribution packs yet.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Growth Intelligence</p>
            {analyticsLoading && <p className="mt-2 text-[11px] text-cyan-100/80">Refreshing analytics...</p>}
            {analyticsError && <p className="mt-2 text-[11px] text-rose-200">{analyticsError}</p>}
            {analytics ? (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniStat label="Views" value={String(analytics.summary.totalViews)} />
                  <MiniStat label="View/Play" value={String(analytics.summary.viewToPlay)} />
                  <MiniStat label="Avg Clips" value={String(analytics.summary.avgClipPerEpisode)} />
                  <MiniStat label="Avg Dur" value={`${Math.round(analytics.summary.avgDurationSec / 60)}m`} />
                </div>
                <div className="mt-2 space-y-1">
                  {analytics.recommendations.slice(0, 3).map((line) => (
                    <p key={line} className="text-[11px] text-white/65">• {line}</p>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-white/50">Loading analytics...</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Pipeline Health</p>
            {healthLoading && <p className="mt-2 text-[11px] text-cyan-100/80">Running health checks...</p>}
            {healthError && <p className="mt-2 text-[11px] text-rose-200">{healthError}</p>}
            {health ? (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniStat label="Checked" value={String(health.summary.totalChecked)} />
                  <MiniStat label="Healthy" value={String(health.summary.healthy)} />
                  <MiniStat label="Processing" value={String(health.summary.processing)} />
                  <MiniStat label="Failures" value={String(health.summary.failures)} tone={health.summary.failures > 0 ? "danger" : "default"} />
                </div>
                {health.summary.stalled > 0 && (
                  <p className="mt-2 text-[11px] text-amber-100">{health.summary.stalled} pipeline jobs are stalled.</p>
                )}
              </>
            ) : (
              <p className="mt-2 text-[11px] text-white/50">Loading health checks...</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Monetization Clarity</p>
            {monetizationLoading && <p className="mt-2 text-[11px] text-cyan-100/80">Modeling revenue...</p>}
            {monetizationError && <p className="mt-2 text-[11px] text-rose-200">{monetizationError}</p>}
            {monetization && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniStat label="Monthly" value={`$${monetization.revenue.monthly}`} />
                  <MiniStat label="Per Ep" value={`$${monetization.revenue.perEpisode}`} />
                  <MiniStat label="Sponsor" value={`$${monetization.revenue.sponsor}`} />
                  <MiniStat label="Merch" value={`$${monetization.revenue.merch}`} />
                </div>
                <div className="mt-2 space-y-1">
                  {monetization.assumptions.slice(0, 2).map((line) => (
                    <p key={line} className="text-[11px] text-white/60">• {line}</p>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Collaboration Matrix</p>
            {collabLoading && <p className="mt-2 text-[11px] text-cyan-100/80">Loading collaborators...</p>}
            {collabError && <p className="mt-2 text-[11px] text-rose-200">{collabError}</p>}
            <div className="mt-2 space-y-2">
              {collabEntries.slice(0, 2).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white">{entry.title}</p>
                  <p className="mt-1 text-[11px] text-white/60">Open review notes: {entry.room?.timelineNotes.length ?? 0}</p>
                  <div className="mt-2 space-y-1">
                    {(entry.room?.participants ?? []).slice(0, 2).map((participant) => (
                      <div key={participant.userId} className="flex items-center justify-between gap-2 text-[11px] text-white/70">
                        <span>{participant.user.username || participant.user.name || participant.userId}</span>
                        <div className="flex gap-1">
                          <button type="button" disabled={opBusy} onClick={() => void updateCollaboratorRole(entry.id, participant.userId, "SPEAKER")} className="rounded border border-white/20 px-1.5 py-0.5">Speaker</button>
                          <button type="button" disabled={opBusy} onClick={() => void removeCollaborator(entry.id, participant.userId)} className="rounded border border-rose-300/45 px-1.5 py-0.5 text-rose-100">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!collabLoading && collabEntries.length === 0 && <p className="text-[11px] text-white/50">No collaborator sessions yet.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Action Queue</p>
            <div className="mt-3 space-y-2">
              {actionQueue.length === 0 ? (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
                  Queue clear. All current episodes are healthy.
                </div>
              ) : (
                actionQueue.map((item, index) => (
                  <div key={item.id} className={`rounded-xl border px-3 py-3 transition hover:-translate-y-0.5 ${item.tone === "danger" ? "border-rose-400/40 bg-rose-500/10" : item.tone === "warn" ? "border-amber-300/35 bg-amber-400/10" : "border-cyan-400/30 bg-cyan-400/10"} ${staggerClass(index)}`}>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-white">{item.title}</p>
                    <p className="mt-1 text-[11px] text-white/65">{item.subtitle}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.href && (
                        <Link href={item.href} className="rounded-lg border border-white/20 bg-black/30 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/80 transition hover:border-cyan-300/45">
                          Open
                        </Link>
                      )}
                      {item.actionEpisodeId && item.actionType && (
                        <button type="button" disabled={opBusy} onClick={() => void runEpisodeAction(item.actionEpisodeId!, item.actionType!)} className="rounded-lg border border-white/20 bg-black/30 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/80 transition hover:border-cyan-300/45 disabled:opacity-60">
                          {item.actionLabel ?? "Update"}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Broadcast Checklist</p>
            <div className="mt-3 space-y-2 text-sm">
              {[
                { key: "runOfShow", label: "Run of show finalized" },
                { key: "guestAssets", label: "Guest assets collected" },
                { key: "levelsChecked", label: "Audio levels verified" },
                { key: "thumbnailsReady", label: "Cover + thumbnail approved" },
                { key: "clipsPlanned", label: "Clip strategy planned" },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-white/78">
                  <input
                    type="checkbox"
                    checked={checklist[item.key as keyof typeof checklist]}
                    onChange={(e) => setChecklist((current) => ({ ...current, [item.key]: e.target.checked }))}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-3 bottom-3 z-40 md:hidden">
        <div className="rounded-2xl border border-white/15 bg-slate-950/90 p-3 shadow-[0_20px_50px_rgba(2,6,23,0.55)] backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/55">Broadcast Mode</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${isLive ? "animate-pulse bg-rose-500/25 text-rose-100" : "bg-white/10 text-white/55"}`}>
              {isLive ? "Live" : "Standby"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {PHASE_STEPS.map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => requestPhaseChange(step.id)}
                className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${phase === step.id ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-white/70"}`}
              >
                {step.label.replace("-", " ").split(" ")[0]}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsLive((current) => !current)}
              disabled={!liveKitOnline}
              title={liveKitOnline ? undefined : "Configure LiveKit to enable live broadcast."}
              className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-50 ${isLive ? "bg-rose-500 text-white" : "bg-cyan-400 text-slate-950"}`}
            >
              {isLive ? "Stop" : "Go Live"}
            </button>
            <button
              type="button"
              onClick={() => void refreshShows()}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/85"
            >
              Sync
            </button>
            <button
              type="button"
              disabled={!selectedEpisode || opBusy}
              onClick={() => void createSessionForEpisode()}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/85 disabled:opacity-60"
            >
              Session
            </button>
            <button
              type="button"
              disabled={!selectedEpisode || opBusy}
              onClick={() => selectedEpisode && void runEpisodeAction(selectedEpisode.id, "publish_now")}
              className="rounded-xl border border-emerald-300/35 bg-emerald-500/20 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-100 disabled:opacity-60"
            >
              Publish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <div className={`rounded-xl border p-2 ${tone === "danger" ? "border-rose-300/35 bg-rose-400/10" : "border-white/10 bg-white/[0.03]"}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
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
