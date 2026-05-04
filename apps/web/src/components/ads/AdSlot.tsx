import { prisma } from "@/lib/prisma";
import type { AdLocation } from "@ems/db";
import AdBanner from "./AdBanner";

interface Props {
  location: AdLocation;
  className?: string;
}

/**
 * Server component: pick the active placement for a slot location and render
 * its <AdBanner /> client island. Renders nothing if no live ad is found.
 *
 * Selection: highest-priced active placement currently in window. If multiple
 * tie, the most recently created wins (acts as a tie-breaker for fresh ads).
 */
export default async function AdSlot({ location, className }: Props) {
  const now = new Date();
  const placement = await prisma.adPlacement.findFirst({
    where: {
      location,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: [{ price: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      mediaUrl: true,
      linkUrl: true,
    },
  });

  if (!placement) return null;

  return (
    <AdBanner
      placementId={placement.id}
      title={placement.title}
      mediaUrl={placement.mediaUrl}
      linkUrl={placement.linkUrl}
      className={className}
    />
  );
}
