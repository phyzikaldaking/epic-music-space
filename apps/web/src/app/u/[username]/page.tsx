import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ username: string }>;
}

/**
 * Short share URL: /u/{username} → /studio/{username}.
 * Friendlier to type and to print on cards / Twitter bios.
 */
export default async function ShortStudioRedirect({ params }: Props) {
  const { username } = await params;
  redirect(`/studio/${username}`);
}
