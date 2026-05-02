import { Resend } from "resend";
import { getSiteUrl } from "./site";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM ?? "Epic Music Space <noreply@epicmusicspace.com>";

export async function sendVerificationEmail(email: string, token: string) {
  const base = getSiteUrl();
  const url = `${base}/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping verification email");
    console.info(`[email] Verification URL: ${url}`);
    return { ok: true, dev: true };
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Verify your Epic Music Space email",
    html: buildVerificationHtml(url),
    text: `Verify your email by visiting: ${url}\n\nThis link expires in 24 hours.`,
  });

  if (error) {
    console.error("[email] Send failed", error);
    return { ok: false, error };
  }

  return { ok: true };
}

function buildVerificationHtml(url: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify your email</title></head>
<body style="background:#0a0a0a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:40px 16px">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto">
    <tr><td>
      <div style="text-align:center;margin-bottom:32px">
        <div style="display:inline-flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.3);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">♫</div>
          <span style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#a78bfa,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Epic Music Space</span>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px;text-align:center">
        <h1 style="margin:0 0 12px;font-size:26px;font-weight:800">Verify your email</h1>
        <p style="margin:0 0 32px;color:rgba(255,255,255,0.5);font-size:15px;line-height:1.6">
          Click the button below to confirm your email address and activate your account. The link expires in 24 hours.
        </p>
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.01em">
          Verify email address →
        </a>
        <p style="margin:28px 0 0;font-size:12px;color:rgba(255,255,255,0.25)">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
      <p style="text-align:center;margin-top:24px;font-size:11px;color:rgba(255,255,255,0.2)">
        If the button doesn't work, copy and paste this URL into your browser:<br>
        <span style="color:rgba(139,92,246,0.7)">${url}</span>
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}
