/**
 * GET / PATCH /api/user/pro-profile
 *
 * Cinematic-profile fields used by /pro/[username]:
 *   headline, bioLong, coverImage, location, social URLs,
 *   accolade counters, engineerCredits/accolades/gear (JSON),
 *   yearsExperience.
 *
 * Auth: required. Only ENGINEER / PRODUCER / ARTIST can save —
 * LISTENER/LABEL/ADMIN are bounced. We re-validate JSON shapes via
 * the helpers in @/lib/proProfile so a malicious payload can't poison
 * the row with arbitrary keys.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";
import { parseCredits, parseAccolades, parseGear } from "@/lib/proProfile";
import type { Prisma } from "@ems/db";

export const runtime = "nodejs";

const httpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), { message: "URL must start with http(s)://" });

const patchSchema = z
  .object({
    headline:        z.string().trim().max(160).nullable().optional(),
    bioLong:         z.string().trim().max(2000).nullable().optional(),
    coverImage:      httpUrl.nullable().optional(),
    location:        z.string().trim().max(120).nullable().optional(),
    websiteUrl:      httpUrl.nullable().optional(),
    instagramUrl:    httpUrl.nullable().optional(),
    twitterUrl:      httpUrl.nullable().optional(),
    youtubeUrl:      httpUrl.nullable().optional(),
    tiktokUrl:       httpUrl.nullable().optional(),
    spotifyUrl:      httpUrl.nullable().optional(),
    grammyNominations:  z.number().int().min(0).max(99).optional(),
    grammyWins:         z.number().int().min(0).max(99).optional(),
    riaaPlatinum:       z.number().int().min(0).max(999).optional(),
    riaaGold:           z.number().int().min(0).max(999).optional(),
    billboardNumberOne: z.number().int().min(0).max(99).optional(),
    yearsExperience:    z.number().int().min(0).max(80).nullable().optional(),
    proProfilePublished: z.boolean().optional(),
    // Free-form JSON; sanitized via the parsers before write.
    engineerCredits:   z.array(z.unknown()).max(50).optional(),
    engineerAccolades: z.array(z.unknown()).max(30).optional(),
    engineerGear:      z.record(z.unknown()).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      headline: true, bioLong: true, coverImage: true, location: true,
      websiteUrl: true, instagramUrl: true, twitterUrl: true,
      youtubeUrl: true, tiktokUrl: true, spotifyUrl: true,
      grammyNominations: true, grammyWins: true,
      riaaPlatinum: true, riaaGold: true, billboardNumberOne: true,
      yearsExperience: true, proProfilePublished: true,
      engineerCredits: true, engineerAccolades: true, engineerGear: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...user,
    engineerCredits: parseCredits(user.engineerCredits),
    engineerAccolades: parseAccolades(user.engineerAccolades),
    engineerGear: parseGear(user.engineerGear),
  });
}

export async function PATCH(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (me.role !== "ENGINEER" && me.role !== "PRODUCER" && me.role !== "ARTIST" && me.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Pro profile is for engineers, producers, and artists." },
      { status: 403 },
    );
  }

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Normalize: empty strings become null.
  const norm = <T>(v: T | undefined | null): T | null | undefined => {
    if (v === undefined) return undefined;
    if (typeof v === "string" && v.trim() === "") return null;
    return v;
  };

  const data: Prisma.UserUpdateInput = {};
  const p = parsed.data;
  if (p.headline !== undefined)        data.headline = norm(p.headline);
  if (p.bioLong !== undefined)         data.bioLong = norm(p.bioLong);
  if (p.coverImage !== undefined)      data.coverImage = norm(p.coverImage);
  if (p.location !== undefined)        data.location = norm(p.location);
  if (p.websiteUrl !== undefined)      data.websiteUrl = norm(p.websiteUrl);
  if (p.instagramUrl !== undefined)    data.instagramUrl = norm(p.instagramUrl);
  if (p.twitterUrl !== undefined)      data.twitterUrl = norm(p.twitterUrl);
  if (p.youtubeUrl !== undefined)      data.youtubeUrl = norm(p.youtubeUrl);
  if (p.tiktokUrl !== undefined)       data.tiktokUrl = norm(p.tiktokUrl);
  if (p.spotifyUrl !== undefined)      data.spotifyUrl = norm(p.spotifyUrl);
  if (p.grammyNominations !== undefined)  data.grammyNominations = p.grammyNominations;
  if (p.grammyWins !== undefined)         data.grammyWins = p.grammyWins;
  if (p.riaaPlatinum !== undefined)       data.riaaPlatinum = p.riaaPlatinum;
  if (p.riaaGold !== undefined)           data.riaaGold = p.riaaGold;
  if (p.billboardNumberOne !== undefined) data.billboardNumberOne = p.billboardNumberOne;
  if (p.yearsExperience !== undefined)    data.yearsExperience = p.yearsExperience;
  if (p.proProfilePublished !== undefined) data.proProfilePublished = p.proProfilePublished;
  if (p.engineerCredits !== undefined)
    data.engineerCredits = parseCredits(p.engineerCredits) as unknown as Prisma.InputJsonValue;
  if (p.engineerAccolades !== undefined)
    data.engineerAccolades = parseAccolades(p.engineerAccolades) as unknown as Prisma.InputJsonValue;
  if (p.engineerGear !== undefined)
    data.engineerGear = parseGear(p.engineerGear) as unknown as Prisma.InputJsonValue;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: session.user.id }, data });
  return NextResponse.json({ ok: true });
}
