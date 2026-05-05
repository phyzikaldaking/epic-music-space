import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Epic Music Space",
  description: "Epic Music Space Terms of Service governing use of the platform, license purchases, and artist uploads.",
};

const EFFECTIVE_DATE = "May 5, 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 prose prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-sm text-white/45">Effective date: {EFFECTIVE_DATE}</p>

      <p>
        Welcome to Epic Music Space (&ldquo;<strong>EMS</strong>,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
        &ldquo;our&rdquo;). These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your access
        to and use of <Link href="/">epicmusicspace.com</Link> and any related applications, APIs, and
        services (collectively, the &ldquo;<strong>Service</strong>&rdquo;). By creating an account, uploading
        content, or purchasing a license, you agree to these Terms.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least <strong>13 years old</strong> to create an account, and at least the age of
        majority in your jurisdiction (typically 18) to upload content, list tracks for sale, or receive
        payouts. By creating an account you represent that you meet these requirements. We do not knowingly
        collect personal information from children under 13.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You are responsible for safeguarding your account credentials and for all activity under your
        account. You must provide a valid email address. We may suspend or terminate accounts that violate
        these Terms, infringe third-party rights, or pose security risks.
      </p>

      <h2>3. Artist content &amp; licensing</h2>
      <p>
        When you upload a song, cover art, or other media (&ldquo;<strong>Artist Content</strong>&rdquo;) you
        represent and warrant that:
      </p>
      <ul>
        <li>You own or control all rights necessary to upload, distribute, and license the content;</li>
        <li>The content does not infringe any third-party copyright, trademark, publicity, or privacy right;</li>
        <li>The content is not defamatory, unlawful, or otherwise prohibited by these Terms;</li>
        <li>You have cleared all samples, features, and collaborator agreements before upload;</li>
        <li>Royalties owed to collaborators, publishers, PROs, or sample-clearance services are your responsibility, not ours.</li>
      </ul>
      <p>
        You retain ownership of your Artist Content. You grant EMS a worldwide, non-exclusive,
        royalty-free license to host, store, transcode, stream, and display your content on the Service for
        the purpose of operating the Service and fulfilling licenses you set up. This license terminates
        when you remove the content, except where retention is required for accounting, legal, or tax
        purposes.
      </p>

      <h2>4. License purchases</h2>
      <p>
        EMS lets artists sell limited licenses to their tracks. The exact terms of each license — territory,
        media, exclusivity, revenue share — are set by the artist on the track listing page. Purchasing a
        license through the Service grants you the rights described on that page, subject to these Terms.
        See <Link href="/license-agreement">License Agreement</Link> for the standard non-exclusive license
        used unless the listing says otherwise.
      </p>
      <p>
        Licenses are <strong>final-sale</strong> after delivery (download or stream of master file) except
        where required by law or where EMS, in its sole discretion, issues a refund. Sold-out and removed
        listings are auto-refunded by the Service.
      </p>

      <h2>5. Payments &amp; payouts</h2>
      <p>
        Buyers pay through Stripe Checkout. Artists receive payouts via Stripe Connect after completing
        identity verification and tax-form collection. EMS retains a platform fee disclosed at the time of
        listing. We do not hold funds; balances live in your Stripe Connect account and pay out on the
        schedule Stripe determines (typically weekly).
      </p>
      <p>
        You are responsible for all taxes on your earnings. We may issue 1099-K or equivalent tax forms
        when required by law.
      </p>

      <h2>6. Prohibited content &amp; conduct</h2>
      <p>You may not use the Service to:</p>
      <ul>
        <li>Upload content you don&apos;t have rights to;</li>
        <li>Impersonate another person or artist;</li>
        <li>Distribute malware, run automated scripts that aren&apos;t allowed by our public APIs, or scrape the Service;</li>
        <li>Harass, threaten, dox, or stalk any user;</li>
        <li>Sell illegal goods, sexually explicit content involving minors, or content that violates applicable laws;</li>
        <li>Manipulate plays, votes, follower counts, leaderboards, or reviews.</li>
      </ul>
      <p>
        We may remove content and suspend accounts that violate these Terms with or without notice.
      </p>

      <h2>7. Intellectual property &amp; DMCA</h2>
      <p>
        We respect intellectual-property rights and respond to valid takedown notices under the Digital
        Millennium Copyright Act. To submit a notice or counter-notice, see{" "}
        <Link href="/dmca">our DMCA page</Link>.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the maximum extent
        permitted by law, EMS disclaims all warranties, express or implied, including merchantability,
        fitness for a particular purpose, and non-infringement.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, EMS, its officers, employees, and agents will not be liable
        for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or
        revenues, whether incurred directly or indirectly. Our aggregate liability for any claim arising
        out of or relating to the Service will not exceed the greater of the amount you paid us in the
        twelve months preceding the claim or USD $100.
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify and hold EMS harmless from claims, losses, and expenses (including
        reasonable attorneys&apos; fees) arising out of (a) your Artist Content, (b) your violation of these
        Terms, or (c) your violation of any third-party right.
      </p>

      <h2>11. Governing law &amp; dispute resolution</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-laws
        principles. Disputes will be resolved by binding individual arbitration administered by the American
        Arbitration Association under its Consumer Arbitration Rules, except that either party may seek
        injunctive relief in court. <strong>Class actions and class-wide arbitration are waived.</strong>
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these Terms from time to time. Material changes will be announced on the Service or
        by email. Continued use after the effective date of a change constitutes acceptance.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions? Email <a href="mailto:legal@epicmusicspace.com">legal@epicmusicspace.com</a>.
      </p>
    </article>
  );
}
