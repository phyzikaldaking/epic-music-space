import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Legacy deep-link compatibility:
 * /tracks/:id now maps to the canonical /track/:id route.
 */
export default async function LegacyTrackRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/track/${id}`);
}
