import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sanitizeCallbackPath } from "@/lib/safeCallback";
import DawWorkspace from "@/components/daw/DawWorkspace";
import FuturisticStudioPrototype from "@/components/daw/FuturisticStudioPrototype";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio · Board",
  description:
    "Multitrack recording, mixer, and live transport — your in-browser studio.",
};

export default async function StudioBoardPage({
  searchParams,
}: {
  searchParams?: Promise<{ futuristic?: string; prototype?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    const callback = sanitizeCallbackPath("/studio/board");
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const params = await searchParams;
  const showFuturisticPrototype = params?.futuristic === "1" || params?.prototype === "1";

  if (showFuturisticPrototype) {
    return <FuturisticStudioPrototype />;
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <DawWorkspace />
    </div>
  );
}
