# OAuth provider down (Google / GitHub / etc.)

## Signals
- Spike in `[auth] failed-signin` events (see `AuthEvent` table)
- Users complaining "I can't sign in with Google"
- `safeCallback` re-sanitizing tokens at higher than baseline rate

## Triage
1. Check provider status:
   - Google: https://www.google.com/appsstatus
   - GitHub: https://www.githubstatus.com
2. Confirm scope: are email/password sign-ins working? If yes → provider
   issue, not us.
3. Tail the auth log for the past 15 min:
   ```sql
   SELECT "createdAt", provider, kind, reason, "userAgent"
   FROM "AuthEvent" WHERE "createdAt" > now() - interval '15 minutes'
   ORDER BY "createdAt" DESC LIMIT 100;
   ```

## Recovery — provider outage
- Communicate in `#status` and on `/auth/signin` with a short banner: "Google
  sign-in is having issues — try email or GitHub."
- Do nothing in code. Auth.js retries the OAuth dance automatically once the
  provider returns.

## Recovery — our redirect URL changed (post-deploy)
- Verify the provider OAuth app has the production callback URL listed.
- If we added a new env (e.g., a new vanity domain), the OAuth provider's
  console must allow it explicitly.

## Recovery — token rotation needed
- Rotate `AUTH_SECRET` only as part of a planned rollout — it invalidates
  every active session. If forced to rotate during an incident, post in
  `#status` first.
- For a single compromised provider, revoke the OAuth client, mint a new
  client id/secret in the provider console, update Vercel env, redeploy.

## What NOT to do
- Do not shorten the session JWT lifetime to "force users to re-auth and
  recover." It will sign everyone out and amplify the incident.
- Do not delete `Account` rows to "reset" a stuck user. The cascading
  consequences (Stripe customer rebind, etc.) are bigger than the symptom.
- Do not clear `User.email` on a stuck identity. Use the `signInGuard`
  helpers — they handle the merge case correctly.
