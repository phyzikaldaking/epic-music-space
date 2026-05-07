import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StudioSetupForm from "./StudioSetupForm";
import type { Metadata } from "next";
import { sanitizeCallbackPath } from "@/lib/safeCallback";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set Up Your Studio",
  description: "Complete your artist profile so fans can discover your music.",
};

export default async function StudioSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = sanitizeCallbackPath(next, "/studio");
  const session = await auth();
  if (!session?.user?.id) {
    const setupPath = `/studio/setup?next=${encodeURIComponent(nextPath)}`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(setupPath)}`);
  }

  const studio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true, bio: true, district: true, bannerUrl: true },
  }).catch(() => null);

  return <StudioSetupForm studio={studio} nextPath={nextPath} />;
}
