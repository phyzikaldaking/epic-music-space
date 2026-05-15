#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const reportDir = path.resolve('docs/guardian');
const dashboardPath = path.join(reportDir, 'incident-summary.md');
const now = new Date().toISOString();

const summary = `# EMS Guardian Incident Summary\n\nGenerated: ${now}\n\n## Current signals\n\n- Build status: pending live CI result\n- Route smoke: pending live CI result\n- Freeze watch: pending live CI result\n- Performance budget: pending live CI result\n- Security audit: pending live CI result\n- Supabase advisors: pending project verification\n- Sentry runtime intelligence: pending DSN configuration\n\n## AI triage protocol\n\nWhen a failure occurs, Guardian should classify it as build, typecheck, route, runtime, performance, dependency, database, auth, storage, payment, or security. The repair agent should patch the smallest affected surface area, open a PR with proof, and avoid direct production mutation unless rollback has been explicitly approved.\n\n## Required proof\n\n- failing log excerpt\n- suspected root cause\n- changed files\n- commands/checks run\n- preview deployment URL\n- production verification after merge\n`;

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(dashboardPath, summary);
console.log(`Wrote ${dashboardPath}`);
