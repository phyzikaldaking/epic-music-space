import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import CreatorDashboard from "@/components/CreatorDashboard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creator Hub | Epic Music Space",
  description: "Manage your artist career, track performance, wallet, and creator tools on Epic Music Space.",
};

export default async function CreatorPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/creator");
  }
  return <CreatorDashboard />;
}
