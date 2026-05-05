import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Your studio — Epic Music Space",
  description: "Short-link to your own studio profile or dashboard.",
  robots: { index: false, follow: false },
};

/**
 * Short-link to the current user's public studio (or to /dashboard if
 * they don't have one yet, or to sign-in if logged out). Mirrors the
 * /u/[username] pattern so business cards / Twitter bios can use a
 * single canonical URL.
 */
export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/me");
  }

  const studio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true },
  });
  if (studio?.username) {
    redirect(`/studio/${studio.username}`);
  }
  redirect("/dashboard");
}
