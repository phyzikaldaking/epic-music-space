import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import CreatorDashboard from "@/components/CreatorDashboard";

export const dynamic = "force-dynamic";

export default async function CreatorPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/creator");
  }
  return <CreatorDashboard />;
}
