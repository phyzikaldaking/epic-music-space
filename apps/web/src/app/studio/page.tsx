import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import StudioHubClient from "./StudioHubClient";

/**
 * /studio — redirects signed-in users to their own studio profile.
 * Unauthenticated users are sent to sign-up.
 */
export default async function StudioIndexPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew");
  }

  const studio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true },
  });

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <StudioHubClient studioUsername={studio?.username ?? null} />
    </div>
  );
}
