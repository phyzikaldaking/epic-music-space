import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Studio Export",
  description: "Epic Music Space export workspace.",
};

export default function StudioExportPage(): never {
  redirect("/studio/try?mode=publish");
}
