import { validateCriticalEnvironment } from "../src/lib/criticalEnv";
import { isPhoneAuthConfigured } from "../src/lib/phoneAuth";

function hasGoogleOAuth() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET,
  );
}

function printLine(message: string) {
  console.log(`[auth-watchdog] ${message}`);
}

async function main() {
  const report = validateCriticalEnvironment(process.env);
  const errors = report.issues.filter((issue) => issue.severity === "error");
  const warnings = report.issues.filter((issue) => issue.severity === "warning");

  printLine(`env=${report.envName} productionLike=${String(report.isProductionLike)}`);

  if (!hasGoogleOAuth()) {
    warnings.push({
      code: "google_oauth_disabled",
      message: "Google OAuth is disabled (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing).",
      severity: "warning",
    });
  }

  if (!isPhoneAuthConfigured(process.env)) {
    warnings.push({
      code: "phone_auth_disabled",
      message: "Phone OTP sign-in is disabled (Twilio vars missing).",
      severity: "warning",
    });
  }

  for (const issue of [...errors, ...warnings]) {
    const level = issue.severity.toUpperCase();
    printLine(`${level} ${issue.code}: ${issue.message}`);
  }

  if (errors.length > 0) {
    printLine("status=failed");
    process.exit(1);
  }

  printLine("status=ok");
}

void main().catch((err) => {
  console.error("[auth-watchdog] fatal", err);
  process.exit(1);
});
