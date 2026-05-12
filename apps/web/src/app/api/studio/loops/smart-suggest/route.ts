import { NextRequest, NextResponse } from "next/server";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const body = (await req.json()) as { key?: string; bpm?: number };
    const { key = "C", bpm = 120 } = body;

    const mockSuggestions = [
      {
        id: "loop-1",
        name: "Bass Line in C",
        duration: 8,
        compatibility: 98,
        reason: "Perfect key match, BPM compatible",
      },
      {
        id: "loop-2",
        name: "Chord Progression",
        duration: 4,
        compatibility: 85,
        reason: "Harmonically compatible",
      },
      {
        id: "loop-3",
        name: "Pad Ambience",
        duration: 16,
        compatibility: 72,
        reason: "Tempo-neutral, adds texture",
      },
    ];

    return jsonWithRequestId(
      requestId,
      {
        suggestions: mockSuggestions,
        note: "Full implementation uses harmonic analysis + pattern matching",
      },
      { status: 200 }
    );
  } catch (err) {
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
