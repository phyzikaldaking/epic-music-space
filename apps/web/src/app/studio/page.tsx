import type { Metadata } from "next";
import StudioClientBoundary from "./StudioClientBoundary";
import type { StudioMode } from "./try/studio/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio Editor",
  description: "Epic Music Space production editor workspace.",
};

export default async function StudioIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const initialMode: StudioMode = mode === "beat" ? "beat" : "edit";

  return <StudioClientBoundary initialMode={initialMode} />;
}
