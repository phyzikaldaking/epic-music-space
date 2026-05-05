import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import MessagesClient from "./MessagesClient";

export const metadata: Metadata = {
  title: "Messages — Epic Music Space",
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/messages");
  }
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-3xl font-extrabold">
        <span className="text-gradient-ems">Messages</span>
      </h1>
      <p className="mb-6 text-sm text-white/45">
        Direct conversations with other artists and listeners.
      </p>
      <MessagesClient viewerId={session.user.id} />
    </div>
  );
}
