/* eslint-disable */
// k6 load test for the listening-session API surface.
//
// Run:
//   BASE_URL=https://your.epicmusicspace.com \
//   AUTH_COOKIE='next-auth.session-token=...' \
//   ROOM_ID=clxxxxxxxxxxx \
//   k6 run scripts/loadtest/rooms.k6.js
//
// Requires k6 (https://k6.io). The auth cookie is grabbed from a real
// signed-in browser session — k6 can't run NextAuth's OAuth flow.
//
// What it exercises (per-VU):
//   1. GET  /api/rooms                       — list active rooms
//   2. GET  /api/rooms/[id]                  — read room state
//   3. GET  /api/rooms/[id]/messages         — recent chat
//   4. POST /api/rooms/[id]/messages         — send a chat message (rate-limited!)
//   5. POST /api/rooms/[id]/raise            — toggle hand
//
// Default load profile: ramp to 50 concurrent VUs over 30s, hold 1 minute,
// ramp down. Adjust `stages` for stress/soak tests.

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_COOKIE = __ENV.AUTH_COOKIE || "";
const ROOM_ID = __ENV.ROOM_ID;

if (!ROOM_ID) {
  throw new Error("ROOM_ID env var required");
}

const listLatency = new Trend("rooms_list_ms", true);
const readLatency = new Trend("rooms_read_ms", true);
const chatLatency = new Trend("chat_send_ms", true);
const chatBlocked = new Rate("chat_429_rate");

const headers = {
  "Content-Type": "application/json",
  ...(AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {}),
};

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    rooms_list_ms: ["p(95)<500"],
    rooms_read_ms: ["p(95)<700"],
    chat_send_ms: ["p(95)<800"],
    "http_req_failed{type:read}": ["rate<0.01"],
  },
};

export default function () {
  // 1) list
  let res = http.get(`${BASE_URL}/api/rooms`, { headers, tags: { type: "read" } });
  listLatency.add(res.timings.duration);
  check(res, { "list 200": (r) => r.status === 200 });

  // 2) read room
  res = http.get(`${BASE_URL}/api/rooms/${ROOM_ID}`, { headers, tags: { type: "read" } });
  readLatency.add(res.timings.duration);
  check(res, { "read room 200": (r) => r.status === 200 });

  // 3) read messages
  res = http.get(`${BASE_URL}/api/rooms/${ROOM_ID}/messages`, { headers, tags: { type: "read" } });
  check(res, { "read messages 200": (r) => r.status === 200 });

  // 4) send a chat message
  res = http.post(
    `${BASE_URL}/api/rooms/${ROOM_ID}/messages`,
    JSON.stringify({ body: `loadtest msg vu=${__VU} iter=${__ITER}` }),
    { headers, tags: { type: "write" } },
  );
  chatLatency.add(res.timings.duration);
  chatBlocked.add(res.status === 429);
  check(res, { "chat 200 or 429": (r) => r.status === 200 || r.status === 429 });

  // 5) toggle hand
  res = http.post(
    `${BASE_URL}/api/rooms/${ROOM_ID}/raise`,
    JSON.stringify({ raised: __ITER % 2 === 0 }),
    { headers, tags: { type: "write" } },
  );
  check(res, { "raise 200 or 429": (r) => r.status === 200 || r.status === 429 });

  sleep(1);
}
