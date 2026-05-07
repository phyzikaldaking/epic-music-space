/* eslint-disable */
// Traffic-hardening load profile for burst-sensitive endpoints.
//
// Run:
//   BASE_URL=http://localhost:3000 k6 run scripts/loadtest/traffic-hardening.k6.js
//
// Optional authenticated write checks (recommended):
//   AUTH_COOKIE='next-auth.session-token=...' BASE_URL=... k6 run scripts/loadtest/traffic-hardening.k6.js
//
// Optional endpoint overrides:
//   CHECKOUT_SONG_ID=... TIP_ARTIST_ID=... SERVICE_ID=... AUCTION_ID=...

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_COOKIE = __ENV.AUTH_COOKIE || "";

const CHECKOUT_SONG_ID = __ENV.CHECKOUT_SONG_ID || "song-loadtest";
const TIP_ARTIST_ID = __ENV.TIP_ARTIST_ID || "artist-loadtest";
const SERVICE_ID = __ENV.SERVICE_ID || "service-loadtest";
const AUCTION_ID = __ENV.AUCTION_ID || "auction-loadtest";

const readLatency = new Trend("hardening_read_latency_ms", true);
const writeLatency = new Trend("hardening_write_latency_ms", true);
const shedRate = new Rate("hardening_shed_rate");
const writeFailureRate = new Rate("hardening_write_failure_rate");
const expectedThrottleCount = new Counter("hardening_expected_throttle_count");

export const options = {
  stages: [
    { duration: "1m", target: Number(__ENV.WARM_VUS || 30) },
    { duration: "3m", target: Number(__ENV.PEAK_VUS || 120) },
    { duration: "2m", target: Number(__ENV.SOAK_VUS || 120) },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.03"],
    hardening_read_latency_ms: ["p(95)<900", "p(99)<1800"],
    hardening_write_latency_ms: ["p(95)<1400", "p(99)<2500"],
    hardening_shed_rate: ["rate<0.35"],
    hardening_write_failure_rate: ["rate<0.08"],
  },
};

function headers() {
  const h = {
    "content-type": "application/json",
  };
  if (AUTH_COOKIE) h.Cookie = AUTH_COOKIE;
  return h;
}

function idempotencyHeader(prefix) {
  return { "idempotency-key": `${prefix}-${__VU}-${__ITER}` };
}

function runReadChecks() {
  const readPaths = [
    "/api/health/ready",
    "/api/health",
    "/api/search?q=beats",
    "/api/market/listings",
    "/api/leaderboard",
    "/api/posts?limit=20",
  ];

  const path = readPaths[(__VU + __ITER) % readPaths.length];
  const res = http.get(`${BASE_URL}${path}`, { tags: { type: "read", path } });
  readLatency.add(res.timings.duration);

  check(res, {
    "read endpoint healthy": (r) => r.status === 200 || r.status === 503,
  });
}

function runWriteChecks() {
  if (!AUTH_COOKIE) return;

  const payloads = [
    {
      path: "/api/analytics/funnel",
      body: JSON.stringify({ event: "funnel_home_split_cta_click", role: "LISTENER", source: "k6" }),
      idempotencyPrefix: "funnel",
      acceptable: [200, 202, 429, 503],
    },
    {
      path: "/api/checkout",
      body: JSON.stringify({ songId: CHECKOUT_SONG_ID }),
      idempotencyPrefix: "checkout",
      acceptable: [303, 400, 401, 403, 404, 409, 429, 503],
    },
    {
      path: "/api/tips",
      body: JSON.stringify({ artistId: TIP_ARTIST_ID, amount: 5, message: "loadtest" }),
      idempotencyPrefix: "tips",
      acceptable: [201, 400, 401, 403, 404, 429, 503],
    },
    {
      path: `/api/services/${SERVICE_ID}/checkout`,
      body: JSON.stringify({ brief: "loadtest brief" }),
      idempotencyPrefix: "service-checkout",
      acceptable: [200, 400, 401, 403, 404, 410, 429, 503],
    },
    {
      path: `/api/auctions/${AUCTION_ID}/bid`,
      body: JSON.stringify({ amount: 12.5 }),
      idempotencyPrefix: "auction-bid",
      acceptable: [200, 400, 401, 403, 404, 409, 429, 503],
    },
  ];

  const selected = payloads[(__VU * 7 + __ITER) % payloads.length];
  const res = http.post(`${BASE_URL}${selected.path}`, selected.body, {
    headers: { ...headers(), ...idempotencyHeader(selected.idempotencyPrefix) },
    tags: { type: "write", path: selected.path },
  });

  writeLatency.add(res.timings.duration);

  if (res.status === 429) expectedThrottleCount.add(1);
  if (res.status === 202 || res.status === 503) shedRate.add(1);
  else shedRate.add(0);

  writeFailureRate.add(!selected.acceptable.includes(res.status));
  check(res, {
    "write endpoint acceptable": (r) => selected.acceptable.includes(r.status),
  });
}

export default function () {
  runReadChecks();
  runWriteChecks();
  sleep(0.5);
}
