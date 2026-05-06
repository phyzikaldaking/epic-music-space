import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Standard License Agreement",
  description: "The standard non-exclusive license used for tracks purchased on Epic Music Space.",
};

export default function LicenseAgreementPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 prose prose-invert">
      <h1>Standard License Agreement</h1>
      <p className="text-sm text-white/45">
        This is the default non-exclusive license issued for every track purchase on Epic Music Space
        unless the track listing specifies different terms.
      </p>

      <h2>1. Grant</h2>
      <p>
        The artist (the &ldquo;<strong>Licensor</strong>&rdquo;) grants you (the &ldquo;<strong>Licensee
        </strong>&rdquo;) a worldwide, non-exclusive, perpetual, non-transferable, non-sublicensable
        license to synchronize, reproduce, distribute, publicly perform, and create derivative works of
        the master recording purchased (the &ldquo;<strong>Master</strong>&rdquo;) in your own works, in
        any media now known or later developed.
      </p>

      <h2>2. Restrictions</h2>
      <ul>
        <li>You may not resell, redistribute, or sub-license the Master as a stand-alone audio file.</li>
        <li>You may not register the Master with content-ID services as your own work.</li>
        <li>You may not use the Master in connection with content that is unlawful, defamatory, or that violates a third party&apos;s rights.</li>
      </ul>

      <h2>3. Revenue share</h2>
      <p>
        Where the listing states a revenue-share percentage, that percentage of revenue earned from your
        derivative work that is directly attributable to the Master must be reported to and paid to the
        Licensor through Epic Music Space&apos;s royalty pipeline.
      </p>

      <h2>4. Credit</h2>
      <p>
        You agree to credit the Licensor on any release that uses the Master, in the form
        &ldquo;Produced by [Licensor name] / Epic Music Space&rdquo; or substantially similar, where
        format permits.
      </p>

      <h2>5. Refunds</h2>
      <p>
        Licenses are final-sale once the Master is delivered (downloaded or streamed in full) except
        where required by law or where Epic Music Space, in its sole discretion, issues a refund. Sold-out
        and removed listings are auto-refunded.
      </p>

      <h2>6. Warranties</h2>
      <p>
        The Licensor represents that they own or control all rights necessary to grant this license, that
        all samples and features are cleared, and that the Master does not infringe any third-party right.
        The Licensor will indemnify the Licensee against breach of these warranties.
      </p>

      <h2>7. No additional warranties</h2>
      <p>
        Beyond the warranties in Section 6, the Master is provided &ldquo;as is.&rdquo; Epic Music Space
        does not warrant fitness for any particular purpose.
      </p>

      <h2>8. Termination</h2>
      <p>
        This license terminates automatically if you breach a material term. On termination you must stop
        using the Master and destroy any copies in your possession. Sections 2, 5, 6, 7, 9, and 10 survive
        termination.
      </p>

      <h2>9. Governing law &amp; disputes</h2>
      <p>
        This agreement is governed by the law of the State of Delaware, USA. Disputes are resolved per the
        arbitration clause in our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>10. Whole agreement</h2>
      <p>
        This document plus the listing-specific terms displayed at checkout, plus our Terms of Service,
        form the whole agreement between you and the Licensor with respect to the Master. Custom terms
        published on the listing page override conflicting terms here.
      </p>

      <p className="text-sm text-white/45">
        Questions: <a href="mailto:legal@epicmusicspace.com">legal@epicmusicspace.com</a>.
      </p>
    </article>
  );
}
