import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SupportForm from "./SupportForm";

export const metadata: Metadata = {
  title: "Support — Epic Music Space",
  description:
    "Open a support ticket. We respond within one business day to every artist, producer, engineer, and listener.",
};

export default async function SupportPage() {
  const session = await auth();
  let prefill: { email: string; name: string } | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });
    if (user?.email) {
      prefill = { email: user.email, name: user.name ?? "" };
    }
  }
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-extrabold">Support</h1>
      <p className="mb-8 text-sm text-white/55">
        Open a ticket and we&apos;ll respond within one business day. You&apos;ll get a
        confirmation email with a ticket code — reply to that email any time and
        your reply attaches to the same ticket.
      </p>
      <SupportForm prefill={prefill} />
    </div>
  );
}
