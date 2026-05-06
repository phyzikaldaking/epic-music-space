import SignUpForm from "./SignUpForm";

export default function SignUpPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const appleEnabled = Boolean(
    process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET,
  );
  return <SignUpForm googleEnabled={googleEnabled} appleEnabled={appleEnabled} />;
}
