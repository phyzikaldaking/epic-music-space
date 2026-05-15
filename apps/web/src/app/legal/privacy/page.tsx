import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Privacy Policy | Epic Music Space",
  description: "Canonical Epic Music Space privacy policy.",
  alternates: { canonical: "/privacy" },
  robots: { index: false, follow: true },
};

export default function LegalPrivacyRedirect() {
  redirect("/privacy");
}
