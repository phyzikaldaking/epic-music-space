import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_account_id, stripe_onboarded")
      .eq("id", user.id)
      .single();

    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

    // Create or retrieve Stripe Connect account
    let accountId = profile?.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { userId: user.id },
      });
      accountId = account.id;

      await supabase
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", user.id);
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/dashboard/stripe?refresh=true`,
      return_url: `${origin}/dashboard/stripe?success=true`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    console.error("Stripe connect error:", err);
    return NextResponse.json({ error: "Failed to create Connect account" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_account_id, stripe_onboarded")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ onboarded: false, hasAccount: false });
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);
    const onboarded = account.charges_enabled && account.payouts_enabled;

    // Sync onboarded status
    if (onboarded && !profile.stripe_onboarded) {
      await supabase.from("profiles").update({ stripe_onboarded: true }).eq("id", user.id);
    }

    return NextResponse.json({
      onboarded,
      hasAccount: true,
      accountId: profile.stripe_account_id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });
  } catch (err) {
    console.error("Stripe connect status error:", err);
    return NextResponse.json({ error: "Failed to check Connect status" }, { status: 500 });
  }
}
