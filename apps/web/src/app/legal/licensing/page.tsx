import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Standard License Agreement | Epic Music Space",
  description: "Canonical Epic Music Space standard license agreement.",
  alternates: { canonical: "/license-agreement" },
  robots: { index: false, follow: true },
};

export default function LegalLicensingRedirect() {
  redirect("/license-agreement");
}
