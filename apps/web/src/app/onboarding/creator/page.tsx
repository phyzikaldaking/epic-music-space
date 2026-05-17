import CreatorOnboardingClient from "./CreatorOnboardingClient";

export default function CreatorOnboardingPage() {
  return (
    <main className="min-h-screen bg-[#05070b] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row lg:items-start">
        <section className="max-w-xl pt-6">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-200/70">
            Creator Activation
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
            Build your artist identity and start getting paid.
          </h1>
          <p className="mt-6 text-base leading-8 text-white/58">
            Activate your creator profile to unlock public artist pages, uploads, collaboration tools,
            licensing, monetization, and Stripe payouts.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              "Public artist profile",
              "Streaming-ready uploads",
              "Stripe payouts",
              "Marketplace selling",
              "Licensing and splits",
              "Studio collaboration"
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-semibold text-white/72">
                {item}
              </div>
            ))}
          </div>
        </section>

        <div className="w-full max-w-2xl flex-1">
          <CreatorOnboardingClient />
        </div>
      </div>
    </main>
  );
}
