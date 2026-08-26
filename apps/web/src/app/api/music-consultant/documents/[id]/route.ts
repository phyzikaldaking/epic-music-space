import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase";
import { decryptVaultFile } from "@/lib/documentVaultCrypto";

export const runtime = "nodejs";
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const doc = await prisma.rightsDocument.findFirst({ where: { id, ownerId: session.user.id } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const storage = createServerSupabaseClient();
  if (!storage) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  const { data, error } = await storage.storage.from(doc.storageBucket).download(doc.storagePath);
  if (error || !data) return NextResponse.json({ error: "Document unavailable" }, { status: 502 });
  try {
    const clear = decryptVaultFile(Buffer.from(await data.arrayBuffer()));
    return new NextResponse(clear, { headers: { "Content-Type": doc.mimeType, "Content-Disposition": `attachment; filename="${doc.fileName.replace(/["\\]/g, "")}"` } });
  } catch { return NextResponse.json({ error: "Document integrity check failed" }, { status: 500 }); }
}
