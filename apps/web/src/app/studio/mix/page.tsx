import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sanitizeCallbackPath } from "@/lib/safeCallback";
import DawWorkspace from "@/components/daw/DawWorkspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio · Mix",
  description:
    "Compact Pro Tools-style mixer with track inserts, sends, meters, and master output.",
};

export default async function StudioMixPage() {
  const session = await auth();
  if (!session?.user?.id) {
    const callback = sanitizeCallbackPath("/studio/mix");
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callback)}`);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <DawWorkspace />
    </div>
  );
}
