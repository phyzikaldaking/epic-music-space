import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * POST /api/studio/patterns/dna-blend
 * Blends two drum patterns by mixing their step activations.
 * Body: { patternA: boolean[][], patternB: boolean[][], blend: number (0-1), steps: number }
 * Returns: { steps: boolean[][] } merged pattern
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { patternA, patternB, blend = 0.5, steps = 16 } = body;

    if (!patternA || !patternB) {
      return jsonWithRequestId(requestId, { error: "patternA and patternB are required" }, { status: 400 });
    }

    const rowCount = Math.max(patternA.length, patternB.length);
    const stepCount = steps;

    // DNA blend: probabilistically merge steps from A and B based on blend ratio
    const merged: boolean[][] = [];
    for (let row = 0; row < rowCount; row++) {
      const rowA: boolean[] = patternA[row] ?? [];
      const rowB: boolean[] = patternB[row] ?? [];
      const mergedRow: boolean[] = [];
      for (let step = 0; step < stepCount; step++) {
        const aOn = rowA[step] ?? false;
        const bOn = rowB[step] ?? false;
        if (aOn && bOn) {
          // Both active: always keep
          mergedRow.push(true);
        } else if (!aOn && !bOn) {
          // Both silent: always skip
          mergedRow.push(false);
        } else {
          // Conflict: choose based on blend ratio + deterministic seed (row/step hash)
          const seed = ((row * 31 + step * 17) & 0xff) / 255;
          const threshold = aOn ? 1 - blend : blend;
          mergedRow.push(seed < threshold);
        }
      }
      merged.push(mergedRow);
    }

    return jsonWithRequestId(requestId, { steps: merged, blend, rowCount, stepCount });
  } catch (err) {
    console.error("[dna-blend] error", err);
    return jsonWithRequestId(requestId, { error: "Failed to blend patterns" }, { status: 500 });
  }
}
