import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio Editor",
  description: "Epic Music Space production editor workspace.",
};

export default function StudioIndexPage(): never {
  redirect("/studio/try");
}
