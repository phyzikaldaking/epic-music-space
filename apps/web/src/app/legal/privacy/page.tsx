export const metadata = {
  title: "Privacy Policy — Epic Music Space",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-4xl font-extrabold">Privacy Policy</h1>
      <p className="mb-10 text-sm text-white/40">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>

      <div className="space-y-8 text-white/70">
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">
            1. Information We Collect
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <strong className="text-white">Account data:</strong> name, email
              address, hashed password, account type.
            </li>
            <li>
              <strong className="text-white">Transaction data:</strong> purchase
              history, license holdings, payout records.
            </li>
            <li>
              <strong className="text-white">Usage data:</strong> pages visited,
              features used, timestamps.
            </li>
            <li>
              <strong className="text-white">Payment data:</strong> processed
              exclusively by Stripe. We do not store full card numbers.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">
            2. How We Use Your Information
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>To operate and improve the Platform.</li>
            <li>To process license purchases and revenue payouts.</li>
            <li>
              To send transactional emails (purchase receipts, payout
              notifications).
            </li>
            <li>To comply with legal obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">
            3. Sharing of Information
          </h2>
          <p className="text-sm">
            We do not sell your personal information. We share data only with
            trusted service providers (Stripe for payments, hosting providers)
            and as required by law.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">4. Cookies</h2>
          <p className="text-sm">
            We use session cookies for authentication. We do not use tracking
            cookies for advertising.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">5. Your Rights</h2>
          <p className="text-sm">
            You may request access to, correction of, or deletion of your
            personal data by contacting{" "}
            <a
              href="mailto:privacy@epicmusicspace.com"
              className="text-brand-400 hover:underline"
            >
              privacy@epicmusicspace.com
            </a>
            . Deletion requests are subject to our legal record-keeping
            obligations.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">6. Security</h2>
          <p className="text-sm">
            We use industry-standard security practices including encrypted
            connections (TLS), hashed passwords (bcrypt), and least-privilege
            database access. No system is 100% secure; use the Platform at your
            own risk.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">7. Changes</h2>
          <p className="text-sm">
            We may update this policy. Continued use after posting of changes
            constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">8. Contact</h2>
          <p className="text-sm">
            Questions?{" "}
            <a
              href="mailto:privacy@epicmusicspace.com"
              className="text-brand-400 hover:underline"
            >
              privacy@epicmusicspace.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
