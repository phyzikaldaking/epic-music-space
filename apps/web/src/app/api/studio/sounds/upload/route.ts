import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MAX_AUDIO_SIZE = 100 * 1024 * 1024;
const AUDIO_BUCKET = "audio-assets";

function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96) || "sound.wav";
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const kit = String(form.get("kit") ?? "trap");
    const instrument = String(form.get("instrument") ?? "custom");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
    }

    if (!file.type.startsWith("audio/")) {
      return NextResponse.json({ error: "Only audio files can be uploaded." }, { status: 415 });
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return NextResponse.json({ error: "Audio file is too large. Max 100MB." }, { status: 413 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase storage is not configured." }, { status: 503 });
    }

    const ext = safeFileName(file.name).split(".").pop() || "wav";
    const objectPath = `studio/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(objectPath, Buffer.from(bytes), {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(objectPath);

    return NextResponse.json({
      sound: {
        id: objectPath,
        name: file.name,
        url: data.publicUrl,
        source: "upload",
        kit,
        instrument,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[studio/sounds/upload]", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
