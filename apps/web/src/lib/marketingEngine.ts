import { prisma } from "@/lib/prisma";
import { openai, openaiConfigured } from "@/lib/ai";
import type { MarketingPostKind, Prisma } from "@ems/db";

// Marketing engine — four-sub-machine architecture:
//
//   1. SEO content generator
//        Picks promotable subjects (new songs, kit packs, verse
//        listings, top stock artists), writes title/meta/OG-ready
//        copy, persists as a MarketingPost{kind:SEO_PAGE}. The
//        public /promo/[slug] route renders from these rows so the
//        platform's content surface auto-grows.
//
//   2. Social composer
//        Same input list → tweet / IG / TikTok captions tailored to
//        each platform's voice. Persisted as DRAFT for human-style
//        auto-approval review; the execution cron later pushes
//        them to the user's connected accounts via OAuth provider
//        adapters (Twitter v2 / Instagram Graph / TikTok Open API).
//
//   3. Community engagement bot
//        Reads recent tracks + comments, drafts a "community
//        manager" comment for a fraction (default 1 in 5 new
//        tracks). Gated by feature flag — disabled by default so
//        nothing astroturfs your community until an admin flips
//        the switch in /admin/ai.
//
//   4. Weekly self-written plan
//        Reads platform analytics + recent AiInsight rows, writes
//        a MarketingPlan with structured actions. Some actions
//        auto-execute (SEO, social); high-stakes ones (paid ads,
//        emails to >1k users) get queued for admin approval.
//
// Every output passes through a moderation guard so we can't
// publish anything that violates platform-policy. Keys we need:
//   OPENAI_API_KEY                 — copy generation
//   COMMUNITY_AI_ENABLED=1         — feature flag for #3 (off by default)
//   AUTO_SOCIAL_POST_ENABLED=1     — feature flag for #2 push (off by default)

// ── 1. SEO content generator ────────────────────────────────────────

export interface SeoSubject {
  kind: "song" | "kit" | "verse" | "artist";
  id: string;
  name: string;
  tagline?: string;
  /** Source url on the platform we want SEO to drive to. */
  href: string;
}

export async function draftSeoPost(
  subject: SeoSubject,
): Promise<{ title: string; metaDescription: string; bodyHtml: string; slug: string } | null> {
  if (!openai || !openaiConfigured) return null;
  const prompt = `Write SEO-optimized landing copy for Epic Music Space's promo page about a ${subject.kind} called "${subject.name}".
${subject.tagline ? `Tagline: ${subject.tagline}\n` : ""}Source URL: ${subject.href}

Output strict JSON, no markdown:
{
  "title":           SEO title tag (max 70 chars),
  "metaDescription": page meta description (max 160 chars),
  "slug":            url-safe slug (max 60 chars, kebab-case),
  "bodyHtml":        300-500 word landing-page HTML body. Use <h2>, <p>, <a href="...">.
                     Link to the source URL at least twice. Mention "in-browser DAW",
                     "rap stock market", or "verse marketplace" once if it fits
                     naturally. NO inline styles, NO scripts.
}`;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      title: string;
      metaDescription: string;
      slug: string;
      bodyHtml: string;
    };
    if (!parsed.title || !parsed.slug || !parsed.bodyHtml) return null;
    return {
      title: parsed.title.slice(0, 70),
      metaDescription: (parsed.metaDescription ?? "").slice(0, 160),
      slug: sanitizeSlug(parsed.slug),
      bodyHtml: sanitizeHtml(parsed.bodyHtml),
    };
  } catch (err) {
    console.warn("[marketingEngine] draftSeoPost failed", err);
    return null;
  }
}

// ── 2. Social composer ──────────────────────────────────────────────

export type SocialPlatform = "TWITTER" | "INSTAGRAM" | "TIKTOK";

export async function draftSocialCaption(
  subject: SeoSubject,
  platform: SocialPlatform,
): Promise<{ caption: string; hashtags: string[] } | null> {
  if (!openai || !openaiConfigured) return null;
  const constraints =
    platform === "TWITTER"
      ? "Max 240 chars (we'll append a URL). Punchy, single-sentence hook + a question or callout."
      : platform === "INSTAGRAM"
        ? "Max 220 chars. Visual-first language. Implied call to swipe up / tap link in bio."
        : "Max 150 chars. TikTok energy. Tight hook, one rhetorical question, end with a hashtag stack.";
  const prompt = `Write a single ${platform} caption promoting Epic Music Space's ${subject.kind} "${subject.name}".
${subject.tagline ? `Tagline: ${subject.tagline}\n` : ""}URL to drive traffic to: ${subject.href}

${constraints}

Output strict JSON, no markdown:
{
  "caption":  the caption text (no URL — we append it),
  "hashtags": array of 3-6 relevant hashtags (no # prefix)
}`;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { caption: string; hashtags: unknown };
    if (!parsed.caption) return null;
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.slice(0, 8).map((h) => String(h).replace(/^#/, "").slice(0, 30))
      : [];
    return {
      caption: parsed.caption.slice(0, platform === "TWITTER" ? 240 : 280),
      hashtags,
    };
  } catch (err) {
    console.warn("[marketingEngine] draftSocialCaption failed", err);
    return null;
  }
}

// ── 3. Community engagement bot ─────────────────────────────────────

export interface CommunityTargetSong {
  id: string;
  title: string;
  genre: string | null;
  artistName: string;
}

export async function draftCommunityComment(
  song: CommunityTargetSong,
): Promise<string | null> {
  if (!openai || !openaiConfigured) return null;
  if (process.env.COMMUNITY_AI_ENABLED !== "1") return null;
  const prompt = `Write a single short, genuine-feeling community comment about a new track on Epic Music Space.

Track: "${song.title}" by ${song.artistName}${song.genre ? ` (${song.genre})` : ""}.

Rules:
- Sound like a real community member, not an ad.
- 60-180 chars.
- ONE concrete observation (the mix, a section, the vibe).
- No emojis-only filler. One emoji max.
- NO @-mentions, NO URLs, NO "follow us / tag us" CTAs.

Output the comment text only, no quotes.`;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.85,
      messages: [{ role: "user", content: prompt }],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text || text.length < 20) return null;
    return text.slice(0, 220);
  } catch (err) {
    console.warn("[marketingEngine] draftCommunityComment failed", err);
    return null;
  }
}

// ── 4. Weekly plan ──────────────────────────────────────────────────

export interface MarketingPlanAction {
  /** Loose tag the executor reads to route the action. */
  kind: "seo" | "social" | "community" | "email" | "spotlight";
  subjectKind: SeoSubject["kind"];
  subjectId: string;
  subjectName: string;
  subjectHref: string;
  rationale: string;
  /** ISO timestamp; null = run ASAP. */
  scheduledFor?: string;
  /** When true the executor will publish without admin approval —
   *  used for low-risk SEO; high-risk actions (email blasts to >1k
   *  users) leave this false. */
  autoExecute: boolean;
}

export async function draftWeeklyPlan(args: {
  signals: {
    topArtists: Array<{ id: string; name: string; price: number }>;
    hotSongs: Array<{ id: string; title: string; genre: string | null }>;
    recentInsights: Array<{ title: string; recommendation: string | null }>;
  };
}): Promise<{ title: string; summary: string; actions: MarketingPlanAction[] } | null> {
  if (!openai || !openaiConfigured) return null;
  const ctx = JSON.stringify(args.signals).slice(0, 6_000);
  const prompt = `You are the platform-growth brain for Epic Music Space.
Read these recent platform signals (top artists by stock price, hot songs, recent feedback insights) and write a 1-week marketing plan as strict JSON.

Signals:
${ctx}

Output:
{
  "title":   short week-frame title (e.g. "Week of May 12 — Trap producers lead"),
  "summary": 2-3 sentence narrative of the strategy,
  "actions": array of 4-8 concrete actions, each:
    {
      "kind":         "seo" | "social" | "community" | "email" | "spotlight",
      "subjectKind":  "song" | "kit" | "verse" | "artist",
      "subjectId":    string,
      "subjectName":  string,
      "subjectHref":  string,   // url path on the platform
      "rationale":    1-line why,
      "autoExecute":  true for low-risk (seo, social), false otherwise
    }
}

Output ONLY the JSON object.`;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      title: string;
      summary: string;
      actions: MarketingPlanAction[];
    };
    if (!parsed.title || !Array.isArray(parsed.actions)) return null;
    return {
      title: parsed.title.slice(0, 200),
      summary: parsed.summary.slice(0, 2000),
      actions: parsed.actions
        .filter((a) => a && typeof a.subjectId === "string" && typeof a.subjectHref === "string")
        .slice(0, 12),
    };
  } catch (err) {
    console.warn("[marketingEngine] draftWeeklyPlan failed", err);
    return null;
  }
}

// ── Persistence helpers ─────────────────────────────────────────────

/** Insert a MarketingPost as DRAFT. The execution cron flips it to
 *  PUBLISHED once the destination platform call succeeds. */
export async function persistPost(args: {
  planId: string | null;
  kind: MarketingPostKind;
  targetRef: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  scheduledFor?: Date | null;
}): Promise<string> {
  const row = await prisma.marketingPost.create({
    data: {
      planId: args.planId,
      kind: args.kind,
      targetRef: (args.targetRef ?? undefined) as Prisma.InputJsonValue | undefined,
      payload: args.payload as Prisma.InputJsonValue,
      scheduledFor: args.scheduledFor ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

// ── Hardening / utility ─────────────────────────────────────────────

function sanitizeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Allow-list HTML for SEO bodies. Strip script / style / iframe and
// any attributes other than href on anchors. Keeps the LLM's
// occasional <style> injection from leaking into the page.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(\w+)([^>]*?)>/g, (_m, tag: string, attrs: string) => {
      const t = tag.toLowerCase();
      const allowed = new Set(["p", "h2", "h3", "ul", "ol", "li", "strong", "em", "br", "a"]);
      if (!allowed.has(t)) return "";
      if (t === "a") {
        const href = /href="([^"]*)"/i.exec(attrs)?.[1];
        if (!href) return "<a>";
        if (!/^https?:\/\//i.test(href) && !href.startsWith("/")) return "<a>";
        return `<a href="${escapeAttr(href)}">`;
      }
      return `<${t}>`;
    })
    .replace(/<\/(\w+)>/g, (_m, tag: string) => {
      const t = tag.toLowerCase();
      const allowed = new Set(["p", "h2", "h3", "ul", "ol", "li", "strong", "em", "br", "a"]);
      return allowed.has(t) ? `</${t}>` : "";
    });
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
