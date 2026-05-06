import SignInForm from "./SignInForm";

export default function SignInPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const appleEnabled = Boolean(
    process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET,
  );
  const phoneEnabled = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_FROM,
  );
  return (
    <SignInForm
      googleEnabled={googleEnabled}
      appleEnabled={appleEnabled}
      phoneEnabled={phoneEnabled}
    />
  );
}
