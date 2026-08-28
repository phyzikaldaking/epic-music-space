import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Studio Files",
  description: "Epic Music Space files workspace.",
};

export default function StudioFilesPage(): never {
  redirect("/studio/try");
}
