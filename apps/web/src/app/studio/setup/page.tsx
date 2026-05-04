import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StudioSetupForm from "./StudioSetupForm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set Up Your Studio | Epic Music Space",
  description: "Complete your artist profile so fans can discover your music.",
};

export default async function StudioSetupPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/studio/setup");
  }

  const studio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true, bio: true, district: true, bannerUrl: true },
  });

  return <StudioSetupForm studio={studio} />;
}
