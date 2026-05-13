# Epic Music Space Superpowers Runbook

This runbook is the operating guide for the Epic Music Space superpowers system: high-leverage creative tools, studio automation, asset storage, mobile packaging, and external sync integrations.

## Environment variables

Use these production values unless a deployment environment requires an override.

```env
GAME_STUDIO_ASSET_BUCKET=game-studio-assets
ANDROID_PACKAGE_NAME=com.epicmusicspace.app
SUPERPOWERS_RUNBOOK_URL=https://github.com/phyzikaldaking/epic-music-space/blob/main/docs/runbooks/superpowers.md
SPREADSHEET_SYNC_WEBHOOK_URL=https://epicmusicspace.com/api/webhooks/spreadsheet-sync
```

## Game studio asset bucket

The Supabase storage bucket is `game-studio-assets`. It is intended for game/studio media assets such as images, audio previews, video previews, JSON manifests, and 3D asset binaries. Keep large canonical source files in controlled storage and use this bucket for app-facing assets.

## Android package name

The Android package name is `com.epicmusicspace.app`. It must stay stable after Play Store release because changing it creates a different Android application identity.

## Spreadsheet sync webhook

Production webhook URL: `https://epicmusicspace.com/api/webhooks/spreadsheet-sync`.

The endpoint accepts `POST` JSON payloads. Recommended payload shape:

```json
{
  "source": "google-sheets",
  "spreadsheetId": "spreadsheet-id",
  "sheetName": "Sheet1",
  "range": "A1:Z100",
  "event": "sync",
  "rows": []
}
```

If `SPREADSHEET_SYNC_WEBHOOK_SECRET` is configured in the web app environment, callers must send either `Authorization: Bearer <secret>` or `x-webhook-secret: <secret>`.

## Deployment check

After updating any of these values, verify the latest Vercel production deployment is ready and hit:

```bash
curl https://epicmusicspace.com/api/webhooks/spreadsheet-sync
```

Expected response:

```json
{
  "ok": true,
  "service": "spreadsheet-sync",
  "accepts": "POST"
}
```

## Ownership

This runbook belongs to the Epic Music Space production operations workflow. Keep it updated whenever asset storage, package identity, or sync automation changes.

## Production routing note

The public production domain is `epicmusicspace.com`. Confirm that the Vercel project holding that domain is deploying the same GitHub `main` branch before treating a green deployment on any similarly named project as live.
