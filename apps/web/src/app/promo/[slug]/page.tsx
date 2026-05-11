import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const revalidate = 600;

interface SeoPayload {
  title: string;
  metaDescription: string;
  bodyHtml: string;
  slug: string;
}

function payloadFor(payload: unknown): SeoPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<SeoPayload>;
  if (typeof p.title !== "string" || typeof p.bodyHtml !== "string" || typeof p.slug !== "string") {
    return null;
  }
  return {
    title: p.title,
    metaDescription: p.metaDescription ?? "",
    bodyHtml: p.bodyHtml,
    slug: p.slug,
  };
}

async function loadPost(slug: string) {
  // Slug isn't a dedicated column (it lives in the JSON payload),
  // so we filter via Prisma's JSON path query.
  const rows = await prisma.marketingPost.findMany({
    where: {
      kind: "SEO_PAGE",
      status: "PUBLISHED",
      payload: { path: ["slug"], equals: slug },
    },
    orderBy: { publishedAt: "desc" },
    take: 1,
  });
  return rows[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  const payload = post ? payloadFor(post.payload) : null;
  if (!payload) return { title: "Epic Music Space" };
  return {
    title: payload.title,
    description: payload.metaDescription,
  };
}

export default async function PromoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();
  const payload = payloadFor(post.payload);
  if (!payload) notFound();

  // Best-effort impression counter — fire and forget so a slow DB
  // write doesn't slow page render.
  void prisma.marketingPost
    .update({
      where: { id: post.id },
      data: { impressions: { increment: 1 } },
    })
    .catch(() => {
      /* ignore */
    });

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl uppercase tracking-wide sm:text-4xl">
        {payload.title}
      </h1>
      {payload.metaDescription && (
        <p className="mt-3 text-white/65">{payload.metaDescription}</p>
      )}
      <div
        className="prose prose-invert mt-6 max-w-none"
        // bodyHtml is sanitized in marketingEngine.ts before insert —
        // tags allow-listed, attributes scrubbed.
        dangerouslySetInnerHTML={{ __html: payload.bodyHtml }}
      />
    </article>
  );
}
