import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

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

  if (studio?.username) {
    redirect(`/studio/${studio.username}`);
  }

  // No studio yet — send them to the virtual studio live room to explore
  redirect("/studio/live");
}
