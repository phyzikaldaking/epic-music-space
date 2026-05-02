import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "LISTENER") {
    return NextResponse.json(
      { error: "Only artists, labels, and admins can connect payout accounts." },
      { status: 403 },
    );
  }

  const siteUrl = getSiteUrl();
  let stripeConnectId = user.stripeConnectId;

  if (!stripeConnectId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      business_type: "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        emsUserId: user.id,
        emsRole: user.role,
      },
    });

    stripeConnectId = account.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeConnectId },
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: stripeConnectId,
    refresh_url: `${siteUrl}/dashboard/payouts?refresh=1`,
    return_url: `${siteUrl}/dashboard/payouts?connected=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
