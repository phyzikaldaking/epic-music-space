import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decideVaultEntry } from "@/lib/vaultRouting";

/**
 * /vault/new — single, bulletproof entry point for "drop a tape in the vault".
 *
 * Every Vault CTA links here. This page never renders UI; it auth-routes
 * the artist to whatever surface they actually need next, with the legacy
 * flag preserved end-to-end. The previous direct-to-/studio/new link
 * silently failed for any auth state where the artist hadn't fully
 * onboarded — they ended up on a sign-in / sign-up / setup page that
 * dropped the legacy flag, and the CTA looked broken. Older artists
 * trying to drop their first vault tape took it personally — that's the
 * feeling we're never recreating.
 *
 * All branching lives in `decideVaultEntry` (pure function, fully tested)
 * so a regression here can't sneak past CI.
 */
export const dynamic = "force-dynamic";

export default async function VaultNewPage() {
  const session = await auth();

  if (!session?.user?.id) {
    const decision = decideVaultEntry({ signedIn: false });
    redirect(decision.redirectTo);
  }

  // Look up the studio in the same query so we can route in one pass.
  // A DB hiccup here shouldn't dump the artist on home — fail safe by
  // routing through studio/setup, which itself handles auth gracefully.
  let hasStudio = false;
  try {
    const studio = await prisma.studio.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    hasStudio = Boolean(studio);
  } catch {
    hasStudio = false;
  }

  const decision = decideVaultEntry({
    signedIn: true,
    role: session.user.role,
    hasStudio,
  });
  redirect(decision.redirectTo);
}
