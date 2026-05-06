import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SignInForm from "./SignInForm";

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
    const session = await auth();
    if (session?.user?.id) {
      const callbackUrl =
        typeof params.callbackUrl === "string" && params.callbackUrl.startsWith("/")
          ? params.callbackUrl
          : "/dashboard";
      redirect(callbackUrl);
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
