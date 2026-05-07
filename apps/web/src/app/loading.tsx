// Streamed by Next while page.tsx awaits its first server work. Keeps
// the landing visual stable (gradient hero + skeleton CTAs) so users
// never see a blank page during navigation or revalidation. The real
// page replaces this in-place once the homepage data resolves.
export default function HomeLoading() {
  return (
    <div className="vc-page">
      <section className="vc-hero">
        <div className="vc-stars" aria-hidden="true" />
        <div className="vc-hero-content">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <div className="mx-auto h-12 w-3/4 animate-pulse rounded-xl bg-white/10" />
            <div className="mx-auto mt-4 h-5 w-2/3 animate-pulse rounded-md bg-white/8" />
            <div className="mx-auto mt-3 h-5 w-1/2 animate-pulse rounded-md bg-white/8" />
            <div className="mx-auto mt-8 flex max-w-md gap-3">
              <div className="h-12 flex-1 animate-pulse rounded-xl bg-white/10" />
              <div className="h-12 flex-1 animate-pulse rounded-xl bg-white/8" />
            </div>
            <div className="mx-auto mt-10 h-32 w-full max-w-lg animate-pulse rounded-2xl bg-white/6" />
          </div>
        </div>
      </section>
    </div>
  );
}
