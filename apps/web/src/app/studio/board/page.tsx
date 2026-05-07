import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sanitizeCallbackPath } from "@/lib/safeCallback";
import DawWorkspace from "@/components/daw/DawWorkspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio · Board",
  description:
    "Multitrack recording, mixer, and live transport — your in-browser studio.",
};

export default async function StudioBoardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    const callback = sanitizeCallbackPath("/studio/board");
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callback)}`);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <DawWorkspace />
    </div>
  );
}
