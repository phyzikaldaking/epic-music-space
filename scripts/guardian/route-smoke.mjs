#!/usr/bin/env node

const baseUrl = (process.env.GUARDIAN_BASE_URL || process.env.VERCEL_URL || 'https://epic-music-space.vercel.app').replace(/\/$/, '');

const routes = [
  '/',
  '/studio/try',
  '/studio/beat-machine',
  '/studio/mix',
  '/studio/edit',
  '/api/health',
];

const failures = [];

async function checkRoute(route) {
  const url = `${baseUrl}${route}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'EMS-Guardian/1.0' },
    });
    const elapsed = Date.now() - started;
    const ok = response.status >= 200 && response.status < 400;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${response.status} ${elapsed}ms ${route}`);
    if (!ok) failures.push(`${route} returned ${response.status}`);
    if (elapsed > 8000) failures.push(`${route} took ${elapsed}ms`);
  } catch (error) {
    console.log(`FAIL ERR ${route} ${error instanceof Error ? error.message : String(error)}`);
    failures.push(`${route} request failed`);
  }
}

for (const route of routes) {
  await checkRoute(route);
}

if (failures.length) {
  console.error('\nEMS Guardian route smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nEMS Guardian route smoke passed.');
