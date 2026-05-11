import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "EMS Plugin Host · Use your own VST3 / AU plugins",
  description:
    "Bridge the EMS Studio to your installed Waves, UAD, Antares, iZotope, and other VST3 / AU / AAX plugins. Free desktop companion app.",
};

// Landing page for the EMS Plugin Host desktop app. Producers hit
// this from the plugin chain UI when the host isn't running. Until
// the desktop app is shipped, this is a coming-soon / wait-list page
// — once the helper is downloadable we'll swap the buttons for real
// installer links.
export default function PluginHostLandingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-300">
        Plugin Host
      </p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide text-white sm:text-5xl">
        Use your own plugins
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/65">
        The Studio runs in your browser, but your real plugins —{" "}
        <strong className="text-white">Waves, UAD, Antares Auto-Tune,
        iZotope Nectar / Ozone, FabFilter</strong>, anything VST3 / AU /
        AAX — live as native code on your computer. The EMS Plugin Host
        is a small free companion app that bridges the two: the Studio
        streams audio to it, your plugins do the DSP, and you keep
        every license you already paid for.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { label: "macOS · Apple Silicon", note: "VST3 + AU · 12 MB" },
          { label: "macOS · Intel", note: "VST3 + AU · 14 MB" },
          { label: "Windows", note: "VST3 · 10 MB" },
        ].map((d) => (
          <button
            key={d.label}
            type="button"
            disabled
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left opacity-60"
          >
            <p className="text-sm font-bold text-white/85">{d.label}</p>
            <p className="mt-1 text-[11px] text-white/55">{d.note}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-200">
              Coming soon
            </p>
          </button>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-white/45">
        Building now. The browser side already speaks the bridge
        protocol — see{" "}
        <Link href="/studio/board" className="text-violet-200 underline">
          your studio
        </Link>{" "}
        for the plugin chain UI. When the host ships, projects you save
        with plugin slots will rebind automatically on first launch.
      </p>

      <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
          How it works
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-white/75">
          <li>
            Install the EMS Plugin Host app on the same computer you
            run the Studio on.
          </li>
          <li>
            It scans your standard plugin directories (VST3 / AU on
            macOS, VST3 on Windows) and verifies your licenses.
          </li>
          <li>
            The Studio detects it on{" "}
            <code className="text-white/65">localhost:5544</code> and
            shows a &ldquo;Plugins · N detected&rdquo; pill in the header.
          </li>
          <li>
            Click &ldquo;+ Add plugin&rdquo; on any track to insert your plugins
            into that track&apos;s chain. Save the project — your
            plugin slots and parameter values round-trip.
          </li>
        </ol>
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
          What it won&apos;t do
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-white/65">
          <li>
            Run on iOS / iPadOS. The browser can&apos;t talk to a
            sandboxed plugin host on mobile — desktop only.
          </li>
          <li>
            Pirate plugins. Authorization is checked by each vendor; if
            iLok / your UAD account says no, it stays disabled.
          </li>
          <li>
            Network-stream plugins. Audio + control both stay on
            localhost — nothing leaves your machine.
          </li>
        </ul>
      </div>

      <p className="mt-8 text-center text-xs text-white/45">
        Building a plugin host, getting it through Apple notarization
        and Windows code-signing, and supporting every vendor&apos;s
        license dance takes a minute. Want updates when it ships? You
        already have an EMS account — we&apos;ll email you.
      </p>
    </div>
  );
}
