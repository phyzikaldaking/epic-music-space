import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

// Billboard slot pricing: base price + demand multiplier
const BILLBOARD_BASE_PRICE_USD = 50; // $50/week per slot base
const TOTAL_SLOTS = 20;

export async function GET() {
  try {
    const supabase = await createClient();

    // Get active billboard slots (not expired)
    const { data: active } = await supabase
      .from("billboards")
      .select("slot")
      .gt("expires_at", new Date().toISOString());

    const takenSlots = new Set((active ?? []).map((b) => b.slot));
    const availableSlots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i + 1).filter(
      (s) => !takenSlots.has(s)
    );

    // Demand-based pricing: fewer slots = higher price
    const occupancyRate = takenSlots.size / TOTAL_SLOTS;
    const priceMultiplier = 1 + occupancyRate * 2; // 1x to 3x
    const currentPrice = Math.round(BILLBOARD_BASE_PRICE_USD * priceMultiplier);

    return NextResponse.json({
      availableSlots,
      takenSlots: Array.from(takenSlots),
      totalSlots: TOTAL_SLOTS,
      pricePerWeekUsd: currentPrice,
      occupancyRate,
    });
  } catch (err) {
    console.error("Billboard GET error:", err);
    return NextResponse.json({ error: "Failed to fetch billboard data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slot, title, imageUrl, clickUrl, weeks } = await request.json();

    if (!slot || !title || !imageUrl || !weeks || weeks < 1) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify slot is available
    const { data: existing } = await supabase
      .from("billboards")
      .select("id")
      .eq("slot", slot)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (existing) {
      return NextResponse.json({ error: "This slot is already taken" }, { status: 409 });
    }

    // Calculate price
    const { data: activeSlots } = await supabase
      .from("billboards")
      .select("slot")
      .gt("expires_at", new Date().toISOString());

    const occupancyRate = (activeSlots?.length ?? 0) / TOTAL_SLOTS;
    const priceMultiplier = 1 + occupancyRate * 2;
    const pricePerWeek = Math.round(BILLBOARD_BASE_PRICE_USD * priceMultiplier);
    const totalUsd = pricePerWeek * weeks;

    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Billboard Slot #${slot} — ${weeks} week${weeks > 1 ? "s" : ""}`,
              description: `Premium billboard placement in the EMS city grid`,
            },
            unit_amount: totalUsd * 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/billboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billboard`,
      metadata: {
        userId: user.id,
        slot: slot.toString(),
        title,
        imageUrl,
        clickUrl: clickUrl ?? "",
        weeks: weeks.toString(),
        totalUsd: totalUsd.toString(),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Billboard POST error:", err);
    return NextResponse.json({ error: "Failed to create billboard checkout" }, { status: 500 });
  }
}
