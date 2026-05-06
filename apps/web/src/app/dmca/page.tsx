import type { Metadata } from "next";
import Link from "next/link";
import DmcaForm from "./DmcaForm";

export const metadata: Metadata = {
  title: "DMCA Policy & Takedown",
  description: "How to submit a DMCA takedown notice or counter-notice for content on Epic Music Space.",
};

export default function DmcaPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 prose prose-invert">
      <h1>DMCA Policy &amp; Takedown</h1>

      <p>
        Epic Music Space (&ldquo;EMS&rdquo;) respects the intellectual-property rights of others and
        responds to clear notices of alleged infringement that comply with the Digital Millennium Copyright
        Act of 1998 (&ldquo;DMCA&rdquo;) and other applicable laws.
      </p>

      <h2>Designated Agent</h2>
      <p>
        DMCA notices and counter-notices should be addressed to our Designated Agent:
      </p>
      <p>
        <strong>EMS DMCA Agent</strong><br />
        Epic Music Space, Inc.<br />
        Email: <a href="mailto:dmca@epicmusicspace.com">dmca@epicmusicspace.com</a>
      </p>

      <h2>Submitting a Takedown Notice</h2>
      <p>
        A complete notice under 17 U.S.C. § 512(c)(3) must include:
      </p>
      <ol>
        <li>An electronic or physical signature of the copyright owner or authorized agent;</li>
        <li>Identification of the copyrighted work claimed to have been infringed;</li>
        <li>
          Identification of the material that is claimed to be infringing, including the URL on EMS
          sufficient for us to locate it;
        </li>
        <li>Your contact information (name, address, phone, email);</li>
        <li>
          A statement that you have a good-faith belief that the use is not authorized by the copyright
          owner, its agent, or the law;
        </li>
        <li>
          A statement, under penalty of perjury, that the information in the notice is accurate and that
          you are the copyright owner or authorized to act on the owner&apos;s behalf.
        </li>
      </ol>

      <p>
        You can submit a notice via the form below or by emailing the Designated Agent. We typically remove
        or disable access to the material within 1–3 business days of receiving a complete, valid notice.
      </p>

      <DmcaForm />

      <h2>Counter-Notification</h2>
      <p>
        If you believe content was removed by mistake or misidentification, you may submit a counter-notice
        under 17 U.S.C. § 512(g). Email{" "}
        <a href="mailto:dmca@epicmusicspace.com">dmca@epicmusicspace.com</a> with:
      </p>
      <ol>
        <li>Your physical or electronic signature;</li>
        <li>Identification of the removed material and its prior location;</li>
        <li>
          A statement, under penalty of perjury, that you have a good-faith belief the material was removed
          by mistake or misidentification;
        </li>
        <li>
          Your name, address, phone, and a statement consenting to the jurisdiction of the federal court
          for the judicial district in which your address is located (or, if outside the US, any judicial
          district in which EMS may be found);
        </li>
        <li>A statement that you will accept service of process from the original complainant.</li>
      </ol>

      <h2>Repeat Infringers</h2>
      <p>
        EMS will, in appropriate circumstances, terminate the accounts of users who are repeat infringers.
      </p>

      <h2>False Claims</h2>
      <p>
        Knowingly submitting a false notice or counter-notice can subject you to liability for damages,
        including costs and attorneys&apos; fees, under 17 U.S.C. § 512(f).
      </p>

      <h2>Other Rights</h2>
      <p>
        For trademark, publicity, privacy, or other non-DMCA claims, email{" "}
        <a href="mailto:legal@epicmusicspace.com">legal@epicmusicspace.com</a>. See also our{" "}
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </article>
  );
}
