import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const appealSchema = z.object({
  reportId: z.string().cuid(),
  evidence: z.string().trim().min(20).max(3000),
  requestedOutcome: z.string().trim().max(240).optional(),
});

function makeTicketCode(): string {
  // 4 random bytes → 8 hex chars → ~4.3 billion possibilities, collision-safe.
  return `EMS-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function appealDueBy(hours = 48): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`report-appeal:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many appeal attempts. Please wait a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = appealSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const report = await prisma.userReport.findUnique({
    where: { id: parsed.data.reportId },
    select: {
      id: true,
      postId: true,
      reportedUserId: true,
      status: true,
      reason: true,
      createdAt: true,
      reviewedAt: true,
    },
  });
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const postAuthorId = report.postId
    ? (await prisma.post.findUnique({
        where: { id: report.postId },
        select: { authorId: true },
      }))?.authorId ?? null
    : null;
  const canAppeal =
    report.reportedUserId === session.user.id || postAuthorId === session.user.id;
  if (!canAppeal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (report.status === "APPEAL_PENDING") {
    return NextResponse.json(
      { error: "Appeal already in progress for this report." },
      { status: 409 },
    );
  }

  const actionableStatuses = new Set(["SOFT_HOLD", "REVIEWED", "ACTIONED"]);
  if (!actionableStatuses.has(report.status)) {
    return NextResponse.json(
      { error: "This report is not currently eligible for appeal." },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const dueBy = appealDueBy(48);
  const now = new Date();

  let ticketCode = makeTicketCode();
  for (let i = 0; i < 3; i += 1) {
    const existing = await prisma.supportTicket.findUnique({ where: { ticketCode } });
    if (!existing) break;
    ticketCode = makeTicketCode();
  }

  const fallbackUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true },
  });
  const email = (session.user.email ?? fallbackUser?.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "No account email found. Update your profile email first." },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.userReport.update({
      where: { id: report.id },
      data: {
        status: "APPEAL_PENDING",
        reviewedAt: now,
      },
    });

    await tx.moderationAction.create({
      data: {
        actorId: session.user.id,
        reportId: report.id,
        postId: report.postId,
        subjectUserId: session.user.id,
        action: "REPORT_APPEAL_REQUESTED",
        metadata: {
          requestedOutcome: parsed.data.requestedOutcome ?? null,
          evidencePreview: parsed.data.evidence.slice(0, 500),
          dueBy: dueBy.toISOString(),
          previousStatus: report.status,
        },
      },
    });

    await tx.supportTicket.create({
      data: {
        ticketCode,
        email,
        name: session.user.name ?? fallbackUser?.name ?? null,
        subject: `Appeal request for moderation report ${report.id}`,
        body: [
          `Report ID: ${report.id}`,
          `Previous status: ${report.status}`,
          `Reason: ${report.reason}`,
          `Requested outcome: ${parsed.data.requestedOutcome ?? "review and reinstate if compliant"}`,
          `Appeal evidence:`,
          parsed.data.evidence,
          `SLA due by: ${dueBy.toISOString()}`,
        ].join("\n"),
        userId: session.user.id,
        ip,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    ticketCode,
    status: "APPEAL_PENDING",
    timeline: {
      evidenceReceivedAt: now.toISOString(),
      appealDueBy: dueBy.toISOString(),
      slaHours: 48,
    },
  });
}
