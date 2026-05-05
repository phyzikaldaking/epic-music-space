import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password — Epic Music Space",
  description: "Reset your Epic Music Space password.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="mb-2 text-3xl font-extrabold text-gradient-ems">
        Forgot password
      </h1>
      <p className="mb-6 text-sm text-white/55">
        Enter your account email and we&apos;ll send a reset link.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
