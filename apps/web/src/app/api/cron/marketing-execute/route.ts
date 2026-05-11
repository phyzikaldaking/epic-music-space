import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import {
  draftSeoPost,
  draftSocialCaption,
  type SeoSubject,
  type SocialPlatform,
} from "@/lib/marketingEngine";

export const runtime = "nodejs";
export const maxDuration = 60;

// Picks up DRAFT MarketingPost rows whose payload is still
// "pending-generation", generates the actual copy via the marketing
// engine, and either auto-publishes (SEO_PAGE — flips to PUBLISHED
// because the public /promo/[slug] route reads straight from the
// table) or queues for human review on social posts unless
// AUTO_SOCIAL_POST_ENABLED=1.

interface PendingPayload {
  status: "pending-generation";
}

function isPendingPayload(payload: unknown): payload is PendingPayload {
  return Boolean(
    payload && typeof payload === "object" && (payload as { status?: string }).status === "pending-generation",
  );
}

function subjectFromTargetRef(ref: unknown): SeoSubject | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as { kind?: string; id?: string; href?: string; name?: string };
  if (!r.kind || !r.id || !r.href || !r.name) return null;
  if (!["song", "kit", "verse", "artist"].includes(r.kind)) return null;
  return {
    kind: r.kind as SeoSubject["kind"],
    id: r.id,
    name: r.name,
    href: r.href,
  };
}

export async function GET(req: NextRequest) {
  const cronGate = requireCronRequest(req);
  if (!cronGate.ok) return cronGate.response;

  const pending = await prisma.marketingPost.findMany({
    where: { status: "DRAFT" },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  let generated = 0;
  let published = 0;
  let queued = 0;
  let failed = 0;

  for (const post of pending) {
    if (!isPendingPayload(post.payload)) continue;
    const subject = subjectFromTargetRef(post.targetRef);
    if (!subject) {
      await prisma.marketingPost.update({
        where: { id: post.id },
        data: { status: "FAILED", failedReason: "Missing or malformed targetRef" },
      });
      failed++;
      continue;
    }

    if (post.kind === "SEO_PAGE") {
      const seo = await draftSeoPost(subject);
      if (!seo) {
        await prisma.marketingPost.update({
          where: { id: post.id },
          data: { status: "FAILED", failedReason: "LLM unavailable" },
        });
        failed++;
        continue;
      }
      // Slug collision guard.
      const collidesAttempt = await prisma.marketingPost.findFirst({
        where: {
          kind: "SEO_PAGE",
          // We store slug in payload; this is a soft check — uniqueness
          // isn't enforced at the DB level. Future: dedicated col + index.
          payload: { path: ["slug"], equals: seo.slug },
        },
        select: { id: true },
      });
      const finalSlug = collidesAttempt ? `${seo.slug}-${post.id.slice(-4)}` : seo.slug;

      await prisma.marketingPost.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          payload: { ...seo, slug: finalSlug },
        },
      });
      published++;
      generated++;
      continue;
    }

    if (
      post.kind === "SOCIAL_TWITTER" ||
      post.kind === "SOCIAL_INSTAGRAM" ||
      post.kind === "SOCIAL_TIKTOK"
    ) {
      const platform: SocialPlatform =
        post.kind === "SOCIAL_TWITTER"
          ? "TWITTER"
          : post.kind === "SOCIAL_INSTAGRAM"
            ? "INSTAGRAM"
            : "TIKTOK";
      const cap = await draftSocialCaption(subject, platform);
      if (!cap) {
        await prisma.marketingPost.update({
          where: { id: post.id },
          data: { status: "FAILED", failedReason: "LLM unavailable" },
        });
        failed++;
        continue;
      }
      // Auto-push to social only when an admin has flipped the
      // feature flag. Default behaviour: park as DRAFT with the
      // generated copy populated so the admin can copy-paste or
      // approve in /admin/ai.
      const autoPush = process.env.AUTO_SOCIAL_POST_ENABLED === "1";
      await prisma.marketingPost.update({
        where: { id: post.id },
        data: {
          status: autoPush ? "SCHEDULED" : "DRAFT",
          payload: {
            caption: cap.caption,
            hashtags: cap.hashtags,
            url: subject.href,
            platform,
          },
        },
      });
      generated++;
      if (autoPush) queued++;
      continue;
    }

    // Unknown / unsupported kinds — leave alone.
  }

  return NextResponse.json({
    ok: true,
    pendingFound: pending.length,
    generated,
    published,
    queuedForSocial: queued,
    failed,
  });
}
