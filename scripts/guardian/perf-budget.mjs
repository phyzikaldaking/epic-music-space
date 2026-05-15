#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const MAX_ROUTE_KB = 500;
const nextDir = path.resolve('apps/web/.next');

function bytesToKB(bytes) {
  return Math.round(bytes / 1024);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else files.push({ file: full, size: stat.size });
  }
  return files;
}

const jsFiles = walk(nextDir).filter((f) => f.file.endsWith('.js'));

if (!jsFiles.length) {
  console.error('No build artifacts found. Run build first.');
  process.exit(1);
}

const oversized = [];

for (const file of jsFiles) {
  const kb = bytesToKB(file.size);
  if (kb > MAX_ROUTE_KB) {
    oversized.push({ file: file.file, kb });
  }
}

console.log(`Checked ${jsFiles.length} JS artifacts.`);

if (oversized.length) {
  console.error('\nPerformance budget exceeded:');
  for (const item of oversized) {
    console.error(`- ${item.kb}KB ${item.file}`);
  }
  process.exit(1);
}

console.log('EMS Guardian performance budget passed.');
