import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio · Board",
  description:
    "Compact Pro Tools-style edit, mix, and beat-machine board.",
};

export default async function StudioBoardPage() {
  redirect("/studio/try");
}
