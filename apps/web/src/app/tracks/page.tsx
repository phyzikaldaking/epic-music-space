import { redirect } from "next/navigation";

/**
 * Legacy route compatibility:
 * older nav builds and shared links still point to /tracks.
 */
export default function TracksLegacyRedirect() {
  redirect("/marketplace");
}
