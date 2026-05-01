import { canUseNpxFallback, commandExists, fail, info, runCommand } from "./lib.mjs";

const installers = [
  {
    name: "gh",
    label: "GitHub CLI",
    install: { command: "brew", args: ["install", "gh"] },
    login: "gh auth login",
    optional: true,
  },
  {
    name: "vercel",
    label: "Vercel CLI",
    install: { command: "npm", args: ["install", "--global", "vercel"] },
    login: "vercel login",
    optional: true,
  },
  {
    name: "supabase",
    label: "Supabase CLI",
    install: { command: "brew", args: ["install", "supabase/tap/supabase"] },
    login: "supabase login",
    optional: true,
  },
  {
    name: "stripe",
    label: "Stripe CLI",
    install: {
      command: "brew",
      args: ["install", "stripe/stripe-cli/stripe"],
    },
    login: "stripe login",
    optional: true,
  },
  {
    name: "doppler",
    label: "Doppler CLI",
    install: {
      command: "brew",
      args: ["install", "dopplerhq/cli/doppler"],
    },
    login: "doppler login",
    optional: true,
  },
  {
    name: "op",
    label: "1Password CLI",
    install: { command: "brew", args: ["install", "--cask", "1password-cli"] },
    login: "op account add",
    optional: true,
  },
];

const hasBrew = commandExists("brew");
let installFailures = 0;
let installWarnings = 0;

info("Epic Music Space agent setup");
info("");

for (const tool of installers) {
  if (commandExists(tool.name)) {
    info(`PASS ${tool.label} already installed`);
    continue;
  }

  if (!hasBrew && tool.install.command === "brew") {
    const fallback = canUseNpxFallback(tool.name)
      ? ` or use npx ${tool.name}`
      : "";
    info(`WARN ${tool.label} missing - install manually: ${tool.install.command} ${tool.install.args.join(" ")}${fallback}`);
    if (!tool.optional && !canUseNpxFallback(tool.name)) {
      installFailures += 1;
    } else {
      installWarnings += 1;
    }
    continue;
  }

  info(`Installing ${tool.label}...`);
  const result = runCommand(tool.install.command, tool.install.args);
  if (!result.ok) {
    if (canUseNpxFallback(tool.name)) {
      info(`WARN ${tool.label} global install failed - repo scripts can still use npx ${tool.name}`);
      installWarnings += 1;
      continue;
    }
    info(
      `FAIL ${tool.label} install failed - ${result.stderr.trim() || result.stdout.trim() || "unknown error"}`,
    );
    if (tool.optional) {
      installWarnings += 1;
    } else {
      installFailures += 1;
    }
    continue;
  }

  info(`PASS ${tool.label} installed`);
}

info("");
info("Next sign-ins:");
for (const tool of installers) {
  info(`- ${tool.login}`);
}
info("- npm run env:pull");
info("- npm run agent:doctor");

if (installFailures > 0) {
  fail("one or more tool installs were skipped or failed");
}

if (installWarnings > 0) {
  info("");
  info("Setup completed with optional tooling still to install or login.");
}
