import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sanitizeCallbackPath } from "@/lib/safeCallback";
import SignInForm from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Epic Music Space to access Studio, manage your music, and use your account.",
  alternates: { canonical: "/auth/signin" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // If the user is already signed in and there's no OAuth error in the URL,
  // send them straight to their destination so they don't land back here
  // after a successful Google/Apple OAuth redirect.
  const params = await searchParams;
  const hasOauthError = typeof params.error === "string" && params.error.length > 0;
  if (!hasOauthError) {
    const session = await auth().catch((error) => {
      console.error("[auth/signin] session lookup failed; rendering sign-in form", error);
      return null;
    });
    if (session?.user?.id) {
      redirect(sanitizeCallbackPath(typeof params.callbackUrl === "string" ? params.callbackUrl : null));
    }
  }

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const appleEnabled = Boolean(
    process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET,
  );
  const phoneEnabled = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_VERIFY_FROM || process.env.TWILIO_FROM_NUMBER),
  );
  return (
    <SignInForm
      googleEnabled={googleEnabled}
      appleEnabled={appleEnabled}
      phoneEnabled={phoneEnabled}
    />
  );
}
