import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProfileIndexPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/profile");
  }

  // If the user has a public studio, send them there. Otherwise dashboard.
  const studio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true },
  });

  if (studio?.username) {
    redirect(`/studio/${studio.username}`);
  }
  redirect("/dashboard");
}
