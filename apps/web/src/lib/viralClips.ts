export type ViralClip = {
  id: string;
  title: string;
  caption: string;
  artist?: string | null;
  songId?: string | null;
  clipUrl?: string | null;
  thumbnailUrl?: string | null;
  eventType: "leader_change" | "tip" | "boost" | "crowd" | "finale" | "reaction";
  score: number;
  views: number;
  shares: number;
  likes: number;
  comments: number;
  createdAt: string;
};

export function calculateViralRank(clip: Pick<ViralClip, "score" | "views" | "shares" | "likes" | "comments" | "createdAt">) {
  const ageHours = Math.max(1, (Date.now() - new Date(clip.createdAt).getTime()) / 3_600_000);
  const engagement = clip.likes * 1.2 + clip.comments * 2 + clip.shares * 3 + Math.sqrt(Math.max(0, clip.views));
  const freshness = 1 / Math.pow(ageHours, 0.42);
  return Math.round((clip.score * 3 + engagement) * freshness);
}

export function rankViralClips(clips: ViralClip[]) {
  return [...clips].sort((a, b) => calculateViralRank(b) - calculateViralRank(a));
}

export const demoViralClips: ViralClip[] = [
  {
    id: "clip_001",
    title: "Crown Control took over the finals",
    caption: "A leader change hit the room and the crowd energy spiked.",
    artist: "Finalist One",
    songId: "finalist-1",
    clipUrl: null,
    thumbnailUrl: null,
    eventType: "leader_change",
    score: 96,
    views: 18420,
    shares: 312,
    likes: 1480,
    comments: 226,
    createdAt: new Date(Date.now() - 42 * 60_000).toISOString(),
  },
  {
    id: "clip_002",
    title: "A $25 live tip changed the energy",
    caption: "The crowd reacted after a finalist caught a live tip during the battle.",
    artist: "Finalist Two",
    songId: "finalist-2",
    clipUrl: null,
    thumbnailUrl: null,
    eventType: "tip",
    score: 89,
    views: 12110,
    shares: 188,
    likes: 930,
    comments: 144,
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  },
  {
    id: "clip_003",
    title: "Room shock during the final push",
    caption: "Spectators hit the room shock reaction as the finals tightened up.",
    artist: "Finalist Three",
    songId: "finalist-3",
    clipUrl: null,
    thumbnailUrl: null,
    eventType: "reaction",
    score: 78,
    views: 8440,
    shares: 96,
    likes: 580,
    comments: 72,
    createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
  },
];
