import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, calculateFees } from "@/lib/stripe/client";
import { SongWithArtist } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { songId, type, amount: customAmount } = await request.json();

    // Fetch song + artist profile
    const { data: rawSong, error: songError } = await (supabase
      .from("songs")
      .select("*, profiles(*)")
      .eq("id", songId)
      .single() as unknown as Promise<{ data: SongWithArtist | null; error: { message: string } | null }>);

    if (songError || !rawSong) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    const song = rawSong as SongWithArtist;

    // Determine amount
    let amountUsd: number;
    if (type === "fixed") {
      if (!song.price) return NextResponse.json({ error: "No price set" }, { status: 400 });
      amountUsd = song.price;
    } else if (type === "pwyw") {
      if (!customAmount || customAmount < (song.min_price ?? 1)) {
        return NextResponse.json({ error: `Minimum price is $${song.min_price ?? 1}` }, { status: 400 });
      }
      amountUsd = customAmount;
    } else {
      return NextResponse.json({ error: "Invalid sale type" }, { status: 400 });
    }

    const { platformFee, artistPayout } = calculateFees(amountUsd);
    const amountCents = Math.round(amountUsd * 100);
    const platformFeeCents = Math.round(platformFee * 100);

    // Check artist has Stripe Connect account
    const stripeAccountId = song.profiles?.stripe_account_id;
    const stripeOnboarded = song.profiles?.stripe_onboarded;

    // Build session params
    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: song.title,
              description: `by ${song.profiles?.display_name ?? song.profiles?.username ?? "Artist"}`,
              images: song.cover_url ? [song.cover_url] : [],
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/song/${songId}?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/song/${songId}`,
      metadata: {
        songId,
        buyerId: user.id,
        type,
        amountUsd: amountUsd.toString(),
        platformFee: platformFee.toString(),
        artistPayout: artistPayout.toString(),
        artistStripeAccountId: stripeAccountId ?? "",
      },
    };

    // Add platform fee if artist has Connect account
    if (stripeAccountId && stripeOnboarded) {
      sessionParams.payment_intent_data = {
        application_fee_amount: platformFeeCents,
        transfer_data: {
          destination: stripeAccountId,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Create pending purchase record
    await supabase.from("purchases").insert({
      buyer_id: user.id,
      song_id: songId,
      amount_paid: amountUsd,
      stripe_session_id: session.id,
      status: "pending",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
