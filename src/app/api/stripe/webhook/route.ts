import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import Stripe from "stripe";

// Create a Supabase admin client (service role) for webhook — bypasses RLS
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata ?? {};
      const { songId, buyerId, amountUsd, platformFee, artistPayout, artistStripeAccountId } = meta;

      if (!songId || !buyerId) break;

      const amount = parseFloat(amountUsd ?? "0");
      const fee = parseFloat(platformFee ?? "0");
      const payout = parseFloat(artistPayout ?? "0");

      // Update purchase status
      await supabase
        .from("purchases")
        .update({ status: "completed", stripe_payment_intent: session.payment_intent as string })
        .eq("stripe_session_id", session.id);

      // Record transaction
      const { data: song } = await supabase
        .from("songs")
        .select("artist_id")
        .eq("id", songId)
        .single();

      if (song) {
        await supabase.from("transactions").insert({
          from_user_id: buyerId,
          to_user_id: song.artist_id,
          song_id: songId,
          type: "sale",
          amount,
          platform_fee: fee,
          net_amount: payout,
          stripe_transfer_id: session.payment_intent as string,
          metadata: { stripeAccountId: artistStripeAccountId, sessionId: session.id },
        });

        // Create notification for artist
        await supabase.from("notifications").insert({
          user_id: song.artist_id,
          type: "purchase",
          actor_id: buyerId,
          song_id: songId,
          message: `Someone purchased your track for $${amount.toFixed(2)}`,
        });
      }
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      if (account.charges_enabled && account.payouts_enabled) {
        await supabase
          .from("profiles")
          .update({ stripe_onboarded: true })
          .eq("stripe_account_id", account.id);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
