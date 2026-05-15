#!/usr/bin/env node

const weights = {
  buildFailure: 30,
  routeFailure: 25,
  freezeFailure: 20,
  securityHigh: 20,
  perfBudgetFailure: 15,
  sentrySpike: 20,
  supabaseAdvisor: 15,
};

const signals = {
  buildFailure: process.env.GUARDIAN_BUILD_FAILURE === '1',
  routeFailure: process.env.GUARDIAN_ROUTE_FAILURE === '1',
  freezeFailure: process.env.GUARDIAN_FREEZE_FAILURE === '1',
  securityHigh: process.env.GUARDIAN_SECURITY_HIGH === '1',
  perfBudgetFailure: process.env.GUARDIAN_PERF_FAILURE === '1',
  sentrySpike: process.env.GUARDIAN_SENTRY_SPIKE === '1',
  supabaseAdvisor: process.env.GUARDIAN_SUPABASE_ADVISOR === '1',
};

const score = Object.entries(signals).reduce((total, [key, active]) => total + (active ? weights[key] : 0), 0);
const level = score >= 70 ? 'critical' : score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';

console.log(JSON.stringify({ score, level, signals }, null, 2));

if (score >= 70) process.exit(1);
