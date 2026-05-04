import { NextResponse } from "next/server";
import { getStripeHealthReport } from "@/lib/stripeEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getStripeHealthReport();
  const status = report.status === "ok" || report.status === "degraded" ? 200 : 503;

  return NextResponse.json(
    {
      status: report.status,
      timestamp: new Date().toISOString(),
      stripe: {
        envName: report.envName,
        isProductionLike: report.isProductionLike,
        latencyMs: report.latencyMs,
        message: report.message,
        publishableKeyMode: report.publishableKeyMode,
        secretKeyMode: report.secretKeyMode,
        issues: report.issues,
      },
    },
    { status },
  );
}
