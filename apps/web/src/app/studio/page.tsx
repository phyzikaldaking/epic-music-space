import type { Metadata } from "next";
import PhoneStudio from "./try/PhoneStudio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio",
  description: "A focused no-scroll EMS studio workspace with dedicated Edit, Mix, Beat, Collab, and Export pages.",
};

export default function StudioIndexPage() {
  return <PhoneStudio />;
}
