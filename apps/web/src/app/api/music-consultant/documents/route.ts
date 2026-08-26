import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase";
import { encryptVaultFile } from "@/lib/documentVaultCrypto";

export const runtime = "nodejs";
const MAX = 25 * 1024 * 1024;
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const songId = typeof form.get("songId") === "string" ? String(form.get("songId")) : undefined;
  if (!(file instanceof File) || file.size === 0 || file.size > MAX) return NextResponse.json({ error: "File is required and must be <=25MB" }, { status: 400 });
  if (songId && !(await prisma.rightsSong.findFirst({ where: { id: songId, ownerId: session.user.id }, select: { id: true } }))) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  const storage = createServerSupabaseClient();
  if (!storage) return NextResponse.json({ error: "Private document storage is not configured" }, { status: 503 });
  let encrypted;
  try { encrypted = encryptVaultFile(Buffer.from(await file.arrayBuffer())); } catch { return NextResponse.json({ error: "Vault encryption is not configured" }, { status: 503 }); }
  const path = `${session.user.id}/${randomUUID()}.vault`;
  const { error } = await storage.storage.from("artist-documents").upload(path, encrypted.data, { contentType: "application/octet-stream", upsert: false });
  if (error) return NextResponse.json({ error: "Could not store encrypted document" }, { status: 502 });
  try {
    const doc = await prisma.rightsDocument.create({ data: { ownerId: session.user.id, songId, fileName: file.name.slice(0, 255), mimeType: file.type || "application/octet-stream", sizeBytes: file.size, storageBucket: "artist-documents", storagePath: path, encryptionVersion: encrypted.version, checksum: createHash("sha256").update(encrypted.data).digest("hex") } });
    return NextResponse.json({ document: { id: doc.id, fileName: doc.fileName, sizeBytes: doc.sizeBytes } }, { status: 201 });
  } catch {
    await storage.storage.from("artist-documents").remove([path]);
    return NextResponse.json({ error: "Could not record document metadata" }, { status: 500 });
  }
}
