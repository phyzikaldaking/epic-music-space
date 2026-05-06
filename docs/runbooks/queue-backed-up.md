# BullMQ queue backed up

## Signals
- `/api/health/full` showing high `waitingCount` or `delayedCount` on a queue
- Notifications, emails, or moments not delivering on time
- Workers crashlooping (Vercel logs / process supervisor)

## Triage
1. Inspect queue depth:
   ```bash
   # From a dev box with Redis access
   redis-cli -u "$REDIS_URL" LLEN bull:notifications:wait
   redis-cli -u "$REDIS_URL" LLEN bull:notifications:delayed
   ```
2. Check the failed-job count and the last error per queue. The dead-letter
   pattern is in `apps/web/src/lib/queues.ts`.
3. Look at one failing job's `data` and `failedReason` — usually a stale row
   reference or an external API that's down (Resend, FCM, LiveKit).

## Recovery — transient backlog
- Scale workers temporarily. Workers run with graceful shutdown
  (`SIGTERM` → drain) so it's safe to roll the fleet.
- If the queue can absorb concurrent processing, raise the worker concurrency
  in `worker:notifications` start command.

## Recovery — poison message
- Identify the offending job in the failed list.
- Move it to the dead-letter queue (don't just retry — it'll fail again):
  ```js
  await queue.removeFailed({ from: 0, to: 0 });
  ```
- File a Linear ticket so the bug gets fixed in code.

## Recovery — downstream provider down
- Pause the queue. Don't drain — those jobs are real work that needs to land:
  ```js
  await queue.pause();
  // ... wait for provider ...
  await queue.resume();
  ```
- If the provider is permanently dead (e.g., Resend account suspended), the
  emailOutbox table holds the ground truth — flush via `flush-email-outbox`
  cron once a replacement provider is wired.

## What NOT to do
- Do not `redis-cli FLUSHDB`. You will delete every queue, every rate-limit
  bucket, every dedupe key.
- Do not bump worker concurrency to "fix" a poison message — you will fan
  out the failure, not stop it.
- Do not delete queue keys directly. Use the BullMQ API; the schema includes
  multiple coordinated keys per job.
