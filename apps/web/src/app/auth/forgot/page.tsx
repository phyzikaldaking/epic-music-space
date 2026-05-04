import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = {
  title: "Reset Password | Epic Music Space",
  description: "Forgot your password? We'll email you a reset link.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="mb-8 text-center">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">Account recovery</p>
        <h1 className="text-3xl font-extrabold">Forgot your password?</h1>
        <p className="mt-2 text-sm text-white/55">
          Enter your email and we&apos;ll send a reset link. The link expires in 30 minutes.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-xs text-white/35">
        Remembered it?{" "}
        <Link href="/auth/signin" className="text-brand-300 hover:underline">
          Sign in →
        </Link>
      </p>
    </div>
  );
}
