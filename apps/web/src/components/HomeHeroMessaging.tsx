import Link from "next/link";

export default function HomeHeroMessaging() {
  return (
    <>
      <p className="studio-label text-tube-300">
        ◉ The artist operating system for releases, fans, and revenue
      </p>
      <h1 className="mt-4 font-display text-5xl uppercase leading-[1.02] tracking-wider text-white sm:text-6xl lg:text-7xl">
        Launch your music.
        <br />
        <span className="text-tube-300">Build your fanbase.</span>
        <br />
        Sell licenses.
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
        Record in the browser, publish from your studio, host live listening
        rooms, battle for chart momentum, and turn attention into clear digital
        licensing revenue from one command center.
      </p>
      <p className="mx-auto mt-3 max-w-2xl text-sm text-white/55">
        You own your master. EMS takes a flat 10% platform fee, itemized on every payout —{" "}
        <Link
          href="/pricing"
          className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
        >
          see the breakdown
        </Link>
        .
      </p>
    </>
  );
}
