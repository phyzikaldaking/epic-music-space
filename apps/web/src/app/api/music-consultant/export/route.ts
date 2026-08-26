import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type Writer = { name?: string; role?: string; share?: number; ipi?: string };
type Song = { title?: string; artistName?: string; isrc?: string; upc?: string; ipi?: string; cae?: string; territory?: string; writers?: Writer[]; rights?: string[] };

const text = (s: Song) => {
  const writers = (s.writers ?? []).map(w => `${w.name ?? ""} | ${w.role ?? "WRITER"} | ${w.share ?? 0}% | IPI ${w.ipi ?? ""}`);
  return [
    "EMS ARTIST RIGHTS METADATA PACKET", "Version: 1.0", `Generated: ${new Date().toISOString()}`,
    `Title: ${s.title ?? ""}`, `Artist: ${s.artistName ?? ""}`, `ISRC: ${s.isrc ?? ""}`, `UPC: ${s.upc ?? ""}`,
    `IPI: ${s.ipi ?? ""}`, `CAE: ${s.cae ?? ""}`, `Territory: ${s.territory ?? ""}`, `Rights: ${(s.rights ?? []).join(", ")}`,
    "WRITERS", ...writers, "END"
  ].join("\r\n");
};

// Compact valid PDF for metadata packets. Text is escaped and wrapped into a single page.
const pdf = (value: string) => {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const lines = value.split("\r\n").slice(0, 48).map((line, i) => `BT /F1 9 Tf 40 ${760 - i * 14} Td (${esc(line.slice(0, 110))}) Tj ET`).join("\n");
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${lines.length} >>\nstream\n${lines}\nendstream`];
  let out = "%PDF-1.4\n", offsets = [0];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const start = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`; offsets.slice(1).forEach(n => { out += String(n).padStart(10, "0") + " 00000 n \n"; });
  return out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { format?: string; song?: Song } | null;
  if (!body?.song?.title) return NextResponse.json({ error: "song.title is required" }, { status: 400 });
  const format = body.format === "pdf" ? "pdf" : "cwr";
  const packet = text(body.song);
  if (format === "pdf") return new NextResponse(pdf(packet), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${body.song.title.replace(/[^a-z0-9]+/gi, "-")}.pdf"` } });
  return new NextResponse(packet, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${body.song.title.replace(/[^a-z0-9]+/gi, "-")}.cwr.txt"` } });
}
