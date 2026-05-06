"use client";

import Link from "next/link";

export default function MarketplaceError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<main className="mx-auto max-w-5xl px-4 py-14">
			<section className="overflow-hidden rounded-[2rem] border border-red-400/25 bg-gradient-to-br from-red-500/14 via-black/40 to-cyan-400/10 p-7 shadow-2xl shadow-black/50">
				<p className="text-xs font-black uppercase tracking-[0.24em] text-red-200/75">Tracks Recovery</p>
				<h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">Tracks wall hit turbulence</h1>
				<p className="mt-3 max-w-2xl text-sm leading-7 text-white/65">
					The marketplace feed had a render issue, but you can recover instantly. Retry loading the tracks wall, or jump back to your dashboard.
				</p>

				<div className="mt-7 flex flex-wrap gap-3">
					<button
						type="button"
						onClick={reset}
						className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-cyan-200"
					>
						Reload Tracks
					</button>
					<Link
						href="/marketplace"
						className="inline-flex min-h-11 items-center justify-center rounded-full border border-cyan-200/35 bg-cyan-200/10 px-5 text-xs font-black uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-200/20"
					>
						Open Tracks Wall
					</Link>
					<Link
						href="/dashboard"
						className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/18 bg-white/5 px-5 text-xs font-black uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10"
					>
						Back to Dashboard
					</Link>
				</div>
			</section>
		</main>
	);
}
