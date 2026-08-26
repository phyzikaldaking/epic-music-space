/**
 * Shared worker utilities: structured failure logging and a lightweight
 * HTTP health server for Railway/Kubernetes liveness & readiness probes.
 *
 * Workers run as standalone Node.js processes (not inside the Next.js app
 * server), so they need their own minimal health-check surface instead of
 * relying on the Next.js `/api/health` routes.
 */

import { createServer, type Server } from "http";

export interface WorkerReadiness {
  ready: boolean;
  detail: string;
}

/**
 * Logs a worker failure/error using structured JSON so log aggregators can
 * index on `event`, `worker`, and `error`.
 */
export function logWorkerFailure(
  workerName: string,
  event: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  console.error(
    JSON.stringify({
      t: new Date().toISOString(),
      level: "error",
      worker: workerName,
      event,
      message: err.message,
      stack: err.stack,
      ...extra,
    }),
  );
}

/**
 * Starts a minimal HTTP server exposing `GET /health` for liveness &
 * readiness probes. Responds 200 when the worker reports itself ready and
 * 503 otherwise (e.g. still connecting to Redis).
 *
 * The `connection` argument is accepted for parity with the worker's Redis
 * client so callers can pass it through (and future checks — e.g. `ping()`
 * — can be added without changing call sites), though it is not required to
 * build the server today.
 */
export function startWorkerHealthServer(
  workerName: string,
  readiness: WorkerReadiness,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection?: any,
): Server {
  const port = Number(process.env.WORKER_HEALTH_PORT ?? process.env.PORT ?? 3001);

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      const status = readiness.ready ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          worker: workerName,
          ready: readiness.ready,
          detail: readiness.detail,
          connected: connection?.status ?? undefined,
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  server.on("error", (err) => {
    logWorkerFailure(workerName, "health_server_error", err);
  });

  server.listen(port, () => {
    console.info(
      JSON.stringify({
        event: "worker_health_server_listening",
        worker: workerName,
        port,
      }),
    );
  });

  return server;
}
