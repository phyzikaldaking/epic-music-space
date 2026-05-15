#!/usr/bin/env node

import { execSync } from 'node:child_process';

const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const reason = process.env.GUARDIAN_REPAIR_REASON || 'general-repair';
const safeReason = reason.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const branch = `guardian/repair-${now}-${safeReason}`;

function run(command) {
  console.log(`$ ${command}`);
  execSync(command, { stdio: 'inherit' });
}

run('git fetch origin main');
run('git checkout main');
run('git pull --ff-only origin main');
run(`git checkout -b ${branch}`);

console.log(`\nEMS Guardian repair branch created: ${branch}`);
console.log('Next: apply the smallest safe patch, run Guardian checks, then open a PR.');
