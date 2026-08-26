import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const reminder = await prisma.rightsReminder.findFirst({ where: { id, ownerId: session.user.id } });
  if (!reminder) return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const due = reminder.dueAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const body = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Epic Music Space//Artist Rights//EN","BEGIN:VEVENT",`UID:${reminder.id}@epicmusicspace.com`,`DTSTAMP:${stamp}`,`DTSTART:${due}`,`SUMMARY:${esc(reminder.title)}`,reminder.provider ? `DESCRIPTION:${esc("Provider: " + reminder.provider)}` : "", "END:VEVENT","END:VCALENDAR"].filter(Boolean).join("\r\n") + "\r\n";
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="ems-rights-reminder-${reminder.id}.ics"` } });
}
