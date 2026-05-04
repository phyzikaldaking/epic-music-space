import Link from "next/link";

export const metadata = {
  title: "Refund Policy | Epic Music Space",
  description: "How refunds work on Epic Music Space — license purchases, ad placements, tips, and listening sessions.",
};

export default function RefundsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-300">Legal</p>
      <h1 className="text-4xl font-extrabold">Refund policy</h1>
      <p className="mt-2 text-sm text-white/45">Last updated: 2026</p>

      <div className="prose-invert mt-10 space-y-8 text-white/75">
        <section>
          <h2 className="text-xl font-bold text-white">License purchases</h2>
          <p className="mt-2 leading-relaxed">
            Music licenses are digital goods. Once a license is delivered to your
            account it&apos;s yours to use. Refunds are issued in three cases:
          </p>
          <ul className="mt-3 list-disc pl-6 space-y-1">
            <li>The track was misrepresented (wrong audio, wrong rights, wrong artist).</li>
            <li>The download / stem files are corrupted and we can&apos;t fix them within 7 days.</li>
            <li>The artist or platform pulled the track for legal reasons before you could use it.</li>
          </ul>
          <p className="mt-3 leading-relaxed">
            File a claim within 30 days of purchase by emailing{" "}
            <a href="mailto:support@epicmusicspace.com" className="text-brand-300 hover:underline">
              support@epicmusicspace.com
            </a>{" "}
            with your license number (visible on your <Link href="/dashboard" className="text-brand-300 hover:underline">dashboard</Link>).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white">Tips</h2>
          <p className="mt-2 leading-relaxed">
            Tips are non-refundable once delivered. If you tipped the wrong artist
            by mistake, contact support within 7 days and we&apos;ll review.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white">Ad placements</h2>
          <p className="mt-2 leading-relaxed">
            You can pause or cancel an active campaign at any time from your{" "}
            <Link href="/dashboard/ads" className="text-brand-300 hover:underline">
              ads dashboard
            </Link>
            . If you cancel before the placement&apos;s end date, you&apos;re
            eligible for a partial refund proportional to the remaining flight
            time, less the portion already served. Refund requests are reviewed
            by ops within 5 business days.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white">Subscription tiers</h2>
          <p className="mt-2 leading-relaxed">
            You can cancel a subscription any time from your dashboard. Cancellations
            take effect at the end of the current billing period — no proration
            for partial months.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white">Auctions</h2>
          <p className="mt-2 leading-relaxed">
            Winning bids are final. If the seller fails to deliver within 14 days,
            we issue a full refund and ban the seller account. Auction participants
            should retain their downloadable auction records (CSV/JSON) for dispute
            review.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white">Disputes &amp; chargebacks</h2>
          <p className="mt-2 leading-relaxed">
            Card disputes are handled through your bank. If you open a chargeback
            without first contacting support, the corresponding license, ad, or
            tip is automatically revoked. We&apos;d much rather resolve it directly —
            email{" "}
            <a href="mailto:support@epicmusicspace.com" className="text-brand-300 hover:underline">
              support@epicmusicspace.com
            </a>{" "}
            first.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white">Refund processing</h2>
          <p className="mt-2 leading-relaxed">
            Approved refunds return to your original payment method via Stripe.
            Most banks post the refund within 5–10 business days.
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-white/10 pt-6 text-sm text-white/45">
        Questions?{" "}
        <a href="mailto:support@epicmusicspace.com" className="text-brand-300 hover:underline">
          support@epicmusicspace.com
        </a>
      </div>
    </div>
  );
}
