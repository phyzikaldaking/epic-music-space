# Production rollback procedure

## Application deployment rollback

1. Pause new deploys and record the failing release commit, deployment ID, and first failure timestamp.
2. In Railway, open **epic-music-space → production → epic-music-space**.
3. Open Deployments, select the last deployment marked **SUCCESS** before the failure, and choose **Rollback/Redeploy** from that deployment.
4. Confirm the web service healthcheck is green at `/api/health`.
5. Check both workers for `/health` and `/ready`, then run:
   `BASE_URL=https://epicmusicspace.com npm run smoke:production`
6. Record the rollback in the release notes and notify the team.

Never roll back by changing production variables blindly. Preserve the failed deployment logs for diagnosis.

## Prisma migration rollback

Prisma migrations are forward-only once applied. Do not edit or delete an applied migration.

1. Roll back the application deployment first if the new code is incompatible.
2. Take/verify a database backup before corrective work.
3. Identify the migration and affected tables from deploy logs.
4. If the migration is safely reversible, create a new compensating migration that restores the prior schema/data shape.
5. Apply it with `npm run db:deploy` in a controlled deployment.
6. If data loss or uncertainty is involved, restore to a cloned database, validate the app, and schedule the production restore with an explicit approval.
7. Verify `/api/health`, worker readiness, and the production smoke script after the database change.

Document the migration ID, backup/restore point, validation results, and owner in the incident record.
