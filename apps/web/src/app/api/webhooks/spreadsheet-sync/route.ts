import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SpreadsheetSyncPayload = {
  source?: string;
  spreadsheetId?: string;
  sheetName?: string;
  range?: string;
  rows?: unknown[];
  event?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.SPREADSHEET_SYNC_WEBHOOK_SECRET;
  if (!secret) return true;

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const headerSecret = req.headers.get("x-webhook-secret") ?? "";

  return bearer === secret || headerSecret === secret;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "spreadsheet-sync",
    accepts: "POST",
    requiredAuth:
      Boolean(process.env.SPREADSHEET_SYNC_WEBHOOK_SECRET) ? "Bearer token or x-webhook-secret" : "none",
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: SpreadsheetSyncPayload;
  try {
    payload = (await req.json()) as SpreadsheetSyncPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const receivedAt = new Date().toISOString();
  const rowCount = Array.isArray(payload.rows) ? payload.rows.length : 0;

  // This endpoint intentionally acknowledges the sync payload without
  // assuming a permanent schema yet. When the spreadsheet target schema is
  // finalized, this is the single stable URL to extend with database writes,
  // queue publishing, or Slack notifications.
  console.info("spreadsheet-sync:webhook", {
    receivedAt,
    source: payload.source ?? null,
    spreadsheetId: payload.spreadsheetId ?? null,
    sheetName: payload.sheetName ?? null,
    range: payload.range ?? null,
    event: payload.event ?? null,
    rowCount,
  });

  return NextResponse.json({
    ok: true,
    receivedAt,
    source: payload.source ?? null,
    spreadsheetId: payload.spreadsheetId ?? null,
    sheetName: payload.sheetName ?? null,
    range: payload.range ?? null,
    event: payload.event ?? "sync",
    rowCount,
  });
}
