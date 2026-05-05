import type { Metadata } from "next";
import Link from "next/link";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password — Epic Music Space",
  description: "Set a new Epic Music Space password.",
};

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-14">
        <h1 className="mb-2 text-3xl font-extrabold text-gradient-ems">
          Reset password
        </h1>
        <p className="mb-6 text-sm text-white/55">
          Open the link from your email — it includes the reset token.
        </p>
        <Link
          href="/auth/forgot-password"
          className="inline-block rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
        >
          Request a new link →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="mb-2 text-3xl font-extrabold text-gradient-ems">
        Reset password
      </h1>
      <p className="mb-6 text-sm text-white/55">
        Choose a new password — minimum 8 characters.
      </p>
      <ResetPasswordForm token={token} />
    </div>
  );
}
