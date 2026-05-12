import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";
import OpenAI from "openai";

/**
 * Generate AI cover art using DALL-E 3
 * POST body: { trackName: string, genre?: string, projectId: string }
 * Returns: 3 base64-encoded PNG images
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      trackName?: string;
      genre?: string;
      projectId?: string;
    };

    const { trackName = "Untitled", genre = "electronic", projectId } = body;

    if (!projectId) {
      return jsonWithRequestId(
        requestId,
        { error: "projectId required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonWithRequestId(
        requestId,
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const prompt = `Professional album cover art for "${trackName}", ${genre} genre music. Vibrant, modern design, visually striking, no text or lyrics, high quality, 1024x1024 pixels`;

    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
    });

    if (!response.data || response.data.length === 0) {
      return jsonWithRequestId(
        requestId,
        { error: "No images generated" },
        { status: 500 }
      );
    }

    const images = response.data.map((img, idx) => ({
      id: idx + 1,
      base64: `data:image/png;base64,${img.b64_json}`,
    }));

    return jsonWithRequestId(
      requestId,
      { images },
      { status: 200 }
    );
  } catch (err) {
    console.error("[ai/cover-art]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to generate covers" },
      { status: 500 }
    );
  }
}
