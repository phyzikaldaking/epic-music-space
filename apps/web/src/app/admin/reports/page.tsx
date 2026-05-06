import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminReportsClient from "./AdminReportsClient";

export const metadata: Metadata = {
  title: "Reports — Admin",
  robots: { index: false, follow: false },
};

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/reports");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-1 text-3xl font-extrabold">
        <span className="text-gradient-ems">Moderation queue</span>
      </h1>
      <p className="mb-6 text-sm text-white/45">
        User-submitted reports against posts and accounts.
      </p>
      <AdminReportsClient />
    </div>
  );
}
