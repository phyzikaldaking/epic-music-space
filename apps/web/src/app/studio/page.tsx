import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio",
  description: "Epic Music Space Studio opens directly into the production editor workspace.",
};

export default function StudioIndexPage() {
  redirect("/studio/try");
}
