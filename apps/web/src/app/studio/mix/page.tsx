import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio · Mix",
  description:
    "Compact Pro Tools-style mixer with track inserts, sends, meters, and master output.",
};

export default function StudioMixPage(): never {
  redirect("/studio/try?mode=mix");
}
