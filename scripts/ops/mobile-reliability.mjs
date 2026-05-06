import process from "node:process";

const DEFAULT_BASE_URL = process.env.SYNTHETICS_BASE_URL ?? "https://epicmusicspace.com";
const MOBILE_UA =
  process.env.SYNTH_MOBILE_UA ??
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1";

const checks = [
  {
    name: "mobile_home_nav_button",
    method: "GET",
    path: "/",
    expected: [200],
    contains: ['aria-label="Open navigation menu"'],
  },
  {
    name: "tracks_tab_redirect",
    method: "GET",
    path: "/tracks",
    expected: [200, 307, 308, 404],
  },
  {
    name: "mobile_signin_form",
    method: "GET",
    path: "/auth/signin",
    expected: [200],
  },
  {
    name: "mobile_marketplace",
    method: "GET",
    path: "/marketplace",
    expected: [200],
  },
  {
    name: "mobile_rooms_live_page",
    method: "GET",
    path: "/studio/live",
    expected: [200],
  },
  {
    name: "mobile_rooms_listing",
    method: "GET",
    path: "/rooms",
    expected: [200],
  },
  {
    name: "mobile_messages_guard",
    method: "GET",
    path: "/messages",
    expected: [200, 302, 307, 308],
  },
  {
    name: "checkout_guard",
    method: "POST",
    path: "/api/checkout",
    body: { songId: "cm00000000000000000000000" },
    expected: [401, 429],
  },
  {
    name: "upload_guard",
    method: "POST",
    path: "/api/upload",
    body: {},
    expected: [400, 401, 405, 429],
  },
  {
    name: "chat_guard",
    method: "POST",
    path: "/api/ai/chat",
    body: { message: "mobile smoke", messages: [] },
    expected: [400, 401, 429],
  },
  {
    name: "room_message_guard",
    method: "POST",
    path: "/api/rooms/cm00000000000000000000000/messages",
    body: { body: "mobile reliability ping" },
    expected: [401, 404, 410, 429],
  },
  {
    name: "timeline_note_guard",
    method: "POST",
    path: "/api/rooms/cm00000000000000000000000/timeline-notes",
    body: { body: "mix note", atSeconds: 12, category: "MIX" },
    expected: [401, 404, 410, 429],
  },
];

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function runFetchCheck(baseUrl, check, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(joinUrl(baseUrl, check.path), {
      method: check.method,
      redirect: "manual",
      headers: {
        "user-agent": MOBILE_UA,
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        ...(check.body ? { "content-type": "application/json" } : {}),
      },
      body: check.body ? JSON.stringify(check.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    const missingContains = (check.contains ?? []).filter((needle) => !text.includes(needle));
    return {
      ...check,
      status: res.status,
      elapsedMs: Date.now() - startedAt,
      ok: check.expected.includes(res.status) && missingContains.length === 0,
      missingContains,
    };
  } catch (error) {
    return {
      ...check,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : "unknown",
      missingContains: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function streamPlaybackCheck(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  try {
    const songRes = await fetch(joinUrl(baseUrl, "/api/songs/list?limit=1"), {
      headers: { "user-agent": MOBILE_UA, accept: "application/json" },
    });
    if (songRes.status !== 200) {
      return {
        name: "playback_stream_proxy",
        status: songRes.status,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        error: "song list unavailable",
      };
    }

    const songs = await songRes.json();
    const songId = songs?.[0]?.id;
    if (!songId) {
      return {
        name: "playback_stream_proxy",
        status: 0,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        error: "no song id found",
      };
    }

    const trackRes = await fetch(joinUrl(baseUrl, `/api/songs/${songId}/stream`), {
      method: "POST",
      headers: { "user-agent": MOBILE_UA, "content-type": "application/json" },
      body: JSON.stringify({ source: "mobile-suite" }),
    });
    if (trackRes.status !== 200) {
      return {
        name: "playback_stream_proxy",
        status: trackRes.status,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        error: "stream tracking failed",
      };
    }

    const streamRes = await fetch(joinUrl(baseUrl, `/api/songs/${songId}/stream`), {
      method: "GET",
      headers: {
        "user-agent": MOBILE_UA,
        referer: joinUrl(baseUrl, `/track/${songId}`),
        origin: baseUrl.replace(/\/$/, ""),
        range: "bytes=0-1",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    return {
      name: "playback_stream_proxy",
      status: streamRes.status,
      elapsedMs: Date.now() - startedAt,
      ok: [200, 206, 422].includes(streamRes.status),
      error: [200, 206, 422].includes(streamRes.status) ? undefined : "stream proxy returned unexpected status",
    };
  } catch (error) {
    return {
      name: "playback_stream_proxy",
      status: 0,
      elapsedMs: Date.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function runMobileReliability(options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = Number(options.timeoutMs ?? process.env.SMOKE_TIMEOUT_MS ?? 12_000);

  const results = [];
  for (const check of checks) {
    const result = await runFetchCheck(baseUrl, check, timeoutMs);
    results.push(result);
    const marker = result.ok ? "OK" : "FAIL";
    console.log(`${marker} ${check.method} ${check.path} -> ${result.status} (${result.elapsedMs}ms)`);
    if (result.missingContains?.length) {
      console.error(`  missing markers: ${result.missingContains.join(", ")}`);
    }
    if (result.error) {
      console.error(`  error: ${result.error}`);
    }
  }

  const playbackResult = await streamPlaybackCheck(baseUrl, timeoutMs);
  results.push(playbackResult);
  const playbackMarker = playbackResult.ok ? "OK" : "FAIL";
  console.log(
    `${playbackMarker} GET/POST /api/songs/:id/stream -> ${playbackResult.status} (${playbackResult.elapsedMs}ms)`,
  );
  if (playbackResult.error) {
    console.error(`  error: ${playbackResult.error}`);
  }

  const failed = results.filter((result) => !result.ok);
  return {
    baseUrl,
    results,
    failed,
    passed: failed.length === 0,
  };
}

async function main() {
  const report = await runMobileReliability();
  if (!report.passed) {
    console.error(
      `Mobile reliability checks failed (${report.failed.length}/${report.results.length})`,
    );
    process.exit(1);
  }
  console.log(
    `Mobile reliability checks passed (${report.results.length}/${report.results.length})`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
