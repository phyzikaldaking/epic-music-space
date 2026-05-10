import type { Metadata } from "next";
import Link from "next/link";
import MicTestClient from "./MicTestClient";

export const metadata: Metadata = {
  title: "Mic test — Epic Music Space",
  description: "Confirm your microphone is working before you record.",
  robots: { index: false, follow: false },
};

export default function MicTestPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <Link href="/studio/board" className="text-xs text-white/55 hover:text-white">
          ← back to studio
        </Link>
        <h1 className="text-3xl font-extrabold">Mic test</h1>
        <p className="text-sm text-white/65">
          Three-second loopback test. Confirms your browser is receiving mic
          audio and warns if it detects feedback (mic + speakers in the same
          room without headphones). Run this once before tracking — it saves
          a lot of &ldquo;why is my take silent&rdquo; moments.
        </p>
      </header>

      <MicTestClient />

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/65 leading-relaxed">
        <p className="mb-2 font-bold uppercase tracking-widest text-white/85">
          What this test checks
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="font-semibold text-white/85">Permission:</span> the browser actually granted mic access.</li>
          <li><span className="font-semibold text-white/85">Signal:</span> sound is reaching the browser (input level &gt; -50 dB).</li>
          <li><span className="font-semibold text-white/85">Headroom:</span> your peak is under -3 dB so you&apos;re not clipping.</li>
          <li><span className="font-semibold text-white/85">Feedback risk:</span> if you&apos;re not on headphones and we detect a tight loop between mic and speakers, we flag it.</li>
        </ul>
      </section>
    </main>
  );
}
