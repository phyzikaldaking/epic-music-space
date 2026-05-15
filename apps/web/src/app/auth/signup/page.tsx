import type { Metadata } from "next";
import SignUpForm from "./SignUpForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Create Account | Epic Music Space",
  description: "Create an Epic Music Space account to upload tracks, join rooms, build playlists, and unlock creator tools.",
  alternates: { canonical: "/auth/signup" },
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const appleEnabled = Boolean(
    process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET,
  );
  return <SignUpForm googleEnabled={googleEnabled} appleEnabled={appleEnabled} />;
}
