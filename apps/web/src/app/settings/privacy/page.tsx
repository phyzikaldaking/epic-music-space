import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import PrivacySettingsClient from "./PrivacySettingsClient";

export const metadata: Metadata = {
  title: "Privacy & Data — Settings",
  robots: { index: false, follow: false },
};

export default async function PrivacySettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/settings/privacy");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-3xl font-extrabold">
        <span className="text-gradient-ems">Privacy &amp; Data</span>
      </h1>
      <p className="mb-6 text-sm text-white/45">
        Exercise your GDPR / CCPA rights — export the personal information we hold about you, or
        permanently delete your account. See our{" "}
        <Link href="/privacy" className="text-brand-400 hover:underline">
          Privacy Policy
        </Link>{" "}
        for the full retention schedule.
      </p>
      <PrivacySettingsClient />
    </div>
  );
}
