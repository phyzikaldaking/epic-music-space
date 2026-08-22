#!/usr/bin/env node

import { execSync } from 'node:child_process';

try {
  console.log('Running npm audit...');
  execSync('npm audit --omit=dev --audit-level=high', { stdio: 'inherit' });
  console.log('EMS Guardian security audit passed.');
} catch (error) {
  console.error('\nEMS Guardian security audit failed.');
  process.exit(1);
}
