#!/usr/bin/env node

const baseUrl = (process.env.GUARDIAN_BASE_URL || 'https://epic-music-space.vercel.app').replace(/\/$/, '');
const routes = ['/studio/try', '/studio/beat-machine'];
const failures = [];

async function sampleRoute(route) {
  const url = `${baseUrl}${route}`;
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'EMS-Guardian-FreezeWatch/1.0' } });
    const elapsed = Date.now() - started;
    clearTimeout(timeout);
    console.log(`${response.ok ? 'PASS' : 'FAIL'} ${route} ${response.status} ${elapsed}ms`);
    if (!response.ok) failures.push(`${route} returned ${response.status}`);
    if (elapsed > 9000) failures.push(`${route} potential freeze: ${elapsed}ms`);
  } catch (error) {
    clearTimeout(timeout);
    failures.push(`${route} timed out or crashed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const route of routes) await sampleRoute(route);

if (failures.length) {
  console.error('\nFreeze watch failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nEMS Guardian freeze watch passed.');
