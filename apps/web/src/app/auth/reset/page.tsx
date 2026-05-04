import Link from "next/link";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = {
  title: "Set New Password | Epic Music Space",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Invalid link</h1>
        <p className="mt-2 text-sm text-white/55">
          This reset link is missing or malformed.
        </p>
        <Link
          href="/auth/forgot"
          className="mt-6 inline-block rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="mb-8 text-center">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">Set new password</p>
        <h1 className="text-3xl font-extrabold">Pick a new password</h1>
        <p className="mt-2 text-sm text-white/55">
          You&apos;ll be signed out of all devices and need to sign in again.
        </p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
