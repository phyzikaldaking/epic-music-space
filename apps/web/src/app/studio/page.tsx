import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import StudioClientBoundary from "./StudioClientBoundary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio Editor",
  description: "Epic Music Space production editor workspace.",
};

export default function StudioIndexPage() {
  return <StudioEntry />;
}

async function StudioEntry() {
  const session = await auth();
  return <StudioClientBoundary />;
}

