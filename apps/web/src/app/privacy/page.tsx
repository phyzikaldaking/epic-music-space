import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Epic Music Space",
  description: "How Epic Music Space collects, uses, shares, and protects personal information.",
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Epic Music Space Privacy Policy", description: "How Epic Music Space handles personal information.", url: "/privacy" },
};

const EFFECTIVE_DATE = "May 5, 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 prose prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-white/45">Effective date: {EFFECTIVE_DATE}</p>

      <p>
        Epic Music Space (&ldquo;<strong>EMS</strong>,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects and
        processes personal information when you use the Service. This Privacy Policy explains what we
        collect, how we use it, who we share it with, and the rights you have over it. It applies to
        everyone who visits epicmusicspace.com or uses our APIs.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — email, password hash, display name, avatar, role, and (for
          artists) studio username, bio, banner.
        </li>
        <li>
          <strong>Content</strong> — songs, cover art, posts, comments, messages, licenses, and metadata
          you upload.
        </li>
        <li>
          <strong>Payment information</strong> — handled by Stripe. We never see full card numbers; we
          store Stripe customer + Connect IDs and a transaction history.
        </li>
        <li>
          <strong>Usage information</strong> — log entries (IP, user-agent, referer), play counts, AI
          score events, search queries, and behavior events used to personalize recommendations.
        </li>
        <li>
          <strong>Cookies</strong> — strictly-necessary session cookies, plus optional analytics cookies
          you control via the cookie banner.
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To operate the Service: serve your feed, process payments, deliver licenses, send notifications.</li>
        <li>To prevent fraud + abuse: rate limiting, BotID checks, moderation queues, audit logs.</li>
        <li>To improve the Service: aggregate analytics, AI scoring, recommendation personalization.</li>
        <li>To comply with legal obligations: tax reporting, DMCA, court orders, sanctions screening.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal information. We do not use your music content to
        train third-party AI models without your explicit opt-in.
      </p>

      <h2>3. Who we share with</h2>
      <ul>
        <li><strong>Stripe</strong> — payment processing, payouts, tax forms.</li>
        <li><strong>Mux</strong> — video transcoding + delivery.</li>
        <li><strong>Supabase</strong> — file storage + database hosting.</li>
        <li><strong>Vercel</strong> — application hosting + edge delivery.</li>
        <li><strong>Resend</strong> — transactional email delivery.</li>
        <li><strong>Sentry / PostHog</strong> — error tracking + product analytics.</li>
        <li><strong>Law enforcement</strong> — only when compelled by valid legal process.</li>
      </ul>
      <p>
        Each subprocessor is bound by a data-processing agreement and processes your data only on our
        instructions. Contact <a href="mailto:privacy@epicmusicspace.com">privacy@epicmusicspace.com</a> for
        the current subprocessor list.
      </p>

      <h2>4. Your rights</h2>
      <p>Depending on where you live, you may have the right to:</p>
      <ul>
        <li><strong>Access</strong> — get a copy of the personal information we hold about you.</li>
        <li><strong>Correct</strong> — update inaccurate information.</li>
        <li><strong>Delete</strong> — request deletion (we retain financial records where required by law).</li>
        <li><strong>Port</strong> — receive your data in a machine-readable format.</li>
        <li><strong>Object / restrict</strong> — opt out of profiling for personalization.</li>
        <li><strong>Withdraw consent</strong> — for any processing based on consent.</li>
      </ul>
      <p>
        To exercise these rights, sign in and visit <Link href="/profile/edit">your profile settings</Link>{" "}
        or email <a href="mailto:privacy@epicmusicspace.com">privacy@epicmusicspace.com</a>. We respond
        within 30 days.
      </p>

      <h2>5. California (CCPA / CPRA)</h2>
      <p>
        California residents have the right to know what personal information we collect, the right to
        delete, the right to correct, and the right to opt-out of the sale or sharing of personal
        information. <strong>We do not sell or share personal information for cross-context behavioral
        advertising.</strong> To submit a verifiable consumer request, see Section 4.
      </p>

      <h2>6. Europe (GDPR / UK GDPR)</h2>
      <p>
        Our legal bases for processing are: contract (operating the Service for you), legitimate interests
        (security + abuse prevention + improving the Service), legal obligation (tax + DMCA), and consent
        (optional cookies + marketing emails). Data may be transferred to the US under Standard
        Contractual Clauses. You have the right to lodge a complaint with your local data-protection
        authority.
      </p>

      <h2>7. Retention</h2>
      <p>
        We retain account and content data while your account is active. After deletion we retain (a)
        anonymized usage logs for up to 13 months, (b) financial records for 7 years where required by tax
        law, and (c) abuse-prevention signals for as long as needed to defend the Service. Read messages
        are pruned at 30 days; unread at 90 days.
      </p>

      <h2>8. Security</h2>
      <p>
        We use HTTPS everywhere, hash passwords with bcrypt at cost 12, encrypt connected-account tokens
        at rest, and run rate limits + BotID + signature verification on webhooks. No system is
        impenetrable; in the event of a qualifying breach we will notify you and authorities as required
        by law.
      </p>

      <h2>9. Children</h2>
      <p>
        The Service is not directed to children under 13. We do not knowingly collect personal information
        from children under 13. If you believe we have, contact us at{" "}
        <a href="mailto:privacy@epicmusicspace.com">privacy@epicmusicspace.com</a> and we will delete it
        promptly.
      </p>

      <h2>10. Cookies</h2>
      <p>See our cookie banner on first visit. Strictly-necessary cookies cannot be disabled; analytics cookies are opt-in.</p>

      <h2>11. Changes</h2>
      <p>
        Material changes to this Policy will be announced on the Service or by email. The effective date
        at the top is updated whenever we change this Policy.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy questions or requests:{" "}
        <a href="mailto:privacy@epicmusicspace.com">privacy@epicmusicspace.com</a>.
      </p>
    </article>
  );
}
