import SignInForm from "./SignInForm";

export default function SignInPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const appleEnabled = Boolean(
    process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET,
  );
  return <SignInForm googleEnabled={googleEnabled} appleEnabled={appleEnabled} />;
}
