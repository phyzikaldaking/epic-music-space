#!/usr/bin/env node
/**
 * Sync Sentry alert rules for EMS.
 *
 * Reads SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT from env.
 * Idempotent — keys rules by `name`, updates if the rule exists, creates if
 * not. Run `--dry` to print the planned operations without sending writes.
 *
 * The rule definitions match scripts/ops/sentry-alerts.md. Update both when
 * you change a rule.
 */

const SENTRY_API = "https://sentry.io/api/0";

const env = {
  token: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG ?? "epic-music-space",
  project: process.env.SENTRY_PROJECT ?? "web",
};

if (!env.token) {
  console.error("SENTRY_AUTH_TOKEN is required (project:write scope).");
  process.exit(1);
}

const dry = process.argv.includes("--dry");

/** @type {Array<{ name: string, payload: object }>} */
const RULES = [
  {
    name: "EMS · error spike (5×)",
    payload: {
      conditions: [
        {
          id: "sentry.rules.conditions.event_frequency.EventFrequencyPercentCondition",
          value: 500,
          comparisonInterval: "1w",
          interval: "5m",
        },
      ],
      filters: [{ id: "sentry.rules.filters.event_attribute.EventAttributeFilter", attribute: "type", match: "eq", value: "error" }],
      actions: [
        { id: "sentry.integrations.slack.notify_action.SlackNotifyServiceAction", channel: "#alerts" },
      ],
      actionMatch: "all",
      filterMatch: "all",
      frequency: 30,
      environment: "production",
    },
  },
  {
    name: "EMS · stripe-webhook unhandled",
    payload: {
      conditions: [
        {
          id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
          value: 0,
          interval: "1m",
        },
      ],
      filters: [
        { id: "sentry.rules.filters.tagged_event.TaggedEventFilter", key: "transaction", match: "eq", value: "/api/webhooks/stripe" },
      ],
      actions: [
        { id: "sentry.integrations.pagerduty.notify_action.PagerDutyNotifyServiceAction", severity: "critical" },
      ],
      actionMatch: "all",
      filterMatch: "all",
      frequency: 1,
      environment: "production",
    },
  },
  {
    name: "EMS · 5xx rate > 1%",
    payload: {
      conditions: [
        { id: "sentry.rules.conditions.event_frequency.EventFrequencyPercentCondition", value: 100, comparisonInterval: "1w", interval: "5m" },
      ],
      filters: [
        { id: "sentry.rules.filters.tagged_event.TaggedEventFilter", key: "http.status_code", match: "sw", value: "5" },
      ],
      actions: [
        { id: "sentry.integrations.slack.notify_action.SlackNotifyServiceAction", channel: "#alerts" },
      ],
      actionMatch: "all",
      filterMatch: "all",
      frequency: 15,
      environment: "production",
    },
  },
];

async function api(method, path, body) {
  const res = await fetch(`${SENTRY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function listExistingRules() {
  return api("GET", `/projects/${env.org}/${env.project}/rules/`);
}

async function createRule(rule) {
  return api("POST", `/projects/${env.org}/${env.project}/rules/`, { name: rule.name, ...rule.payload });
}

async function updateRule(id, rule) {
  return api("PUT", `/projects/${env.org}/${env.project}/rules/${id}/`, { name: rule.name, ...rule.payload });
}

async function main() {
  console.log(`[sentry-alerts] org=${env.org} project=${env.project} dry=${dry}`);
  const existing = await listExistingRules();
  const byName = new Map(existing.map((r) => [r.name, r]));

  for (const rule of RULES) {
    const match = byName.get(rule.name);
    if (match) {
      console.log(`[sentry-alerts] update ${rule.name} (id=${match.id})`);
      if (!dry) await updateRule(match.id, rule);
    } else {
      console.log(`[sentry-alerts] create ${rule.name}`);
      if (!dry) await createRule(rule);
    }
  }
  console.log("[sentry-alerts] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
