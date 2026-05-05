import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import NotificationSettingsClient from "./NotificationSettingsClient";

export const metadata: Metadata = {
  title: "Notifications — Settings · Epic Music Space",
  robots: { index: false, follow: false },
};

export default async function NotificationSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/settings/notifications");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-3xl font-extrabold">
        <span className="text-gradient-ems">Notifications</span>
      </h1>
      <p className="mb-6 text-sm text-white/45">
        Control what shows up in your bell + inbox. New types default to on.
      </p>
      <NotificationSettingsClient />
    </div>
  );
}
