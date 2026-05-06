/* eslint-disable */
// Core web load test for Epic Music Space.
//
// Run:
//   BASE_URL=https://your.epicmusicspace.com k6 run scripts/loadtest/core.k6.js
//
// Optional authenticated checks:
//   AUTH_COOKIE='next-auth.session-token=...' k6 run scripts/loadtest/core.k6.js
//
// Exercises public discovery, status/readiness, marketplace, search, and a few
// authenticated user surfaces when a valid session cookie is provided.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_COOKIE = __ENV.AUTH_COOKIE || "";

const pageLatency = new Trend("page_latency_ms", true);
const apiLatency = new Trend("api_latency_ms", true);
const authFailureRate = new Rate("auth_failure_rate");

const publicRoutes = [
  "/",
  "/marketplace",
  "/radar",
  "/trending",
  "/services",
  "/versus",
  "/status",
  "/pricing",
];

const apiRoutes = [
  "/api/health/ready",
  "/api/health",
  "/api/search?q=beats",
  "/api/market/listings",
  "/api/leaderboard",
];

const authedRoutes = ["/dashboard", "/library", "/messages", "/notifications"];

export const options = {
  stages: [
    { duration: "1m", target: Number(__ENV.K6_TARGET_VUS || 75) },
    { duration: "3m", target: Number(__ENV.K6_TARGET_VUS || 75) },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    page_latency_ms: ["p(95)<900", "p(99)<1800"],
    api_latency_ms: ["p(95)<700", "p(99)<1500"],
    http_req_failed: ["rate<0.02"],
    auth_failure_rate: ["rate<0.05"],
  },
};

function headers() {
  return AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {};
}

export default function () {
  const pagePath = publicRoutes[(__VU + __ITER) % publicRoutes.length];
  let res = http.get(`${BASE_URL}${pagePath}`, { headers: headers(), tags: { surface: "page" } });
  pageLatency.add(res.timings.duration);
  check(res, { "page returned 2xx/3xx": (r) => r.status >= 200 && r.status < 400 });

  const apiPath = apiRoutes[(__VU + __ITER * 3) % apiRoutes.length];
  res = http.get(`${BASE_URL}${apiPath}`, { headers: headers(), tags: { surface: "api" } });
  apiLatency.add(res.timings.duration);
  check(res, { "api returned acceptable": (r) => r.status === 200 || r.status === 503 });

  if (AUTH_COOKIE) {
    const authedPath = authedRoutes[(__VU + __ITER) % authedRoutes.length];
    res = http.get(`${BASE_URL}${authedPath}`, { headers: headers(), tags: { surface: "authed" } });
    authFailureRate.add(res.status === 401 || res.status === 403 || res.status >= 500);
    check(res, { "authed route not failing": (r) => r.status < 500 && r.status !== 401 && r.status !== 403 });
  }

  sleep(1);
}
