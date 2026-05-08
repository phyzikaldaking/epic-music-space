// Streamed by Next while page.tsx awaits its first server work. Keeps
// the landing visual stable (studio control-room skeleton) so users never
// see a blank page during navigation or revalidation. The real homepage
// hero replaces this in-place once the data resolves.
export default function HomeLoading() {
  return (
    <section className="studio-hero relative overflow-hidden">
      <div className="relative z-[1] mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-16">
        {/* Status bar skeleton — matches the real hero's LED chips */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-md studio-faceplate-dark px-3 py-1.5">
            <span aria-hidden className="led-on-rec h-1.5 w-1.5 rounded-full animate-pulse" />
            <span className="studio-label text-rec-400">On Air</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-md studio-faceplate-dark px-3 py-1.5">
            <span aria-hidden className="led-on-amber h-1.5 w-1.5 rounded-full" />
            <span className="studio-label text-tube-300">Live Sessions</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-md studio-faceplate-dark px-3 py-1.5">
            <span aria-hidden className="led-on-green h-1.5 w-1.5 rounded-full" />
            <span className="studio-label text-white/70">Console Online</span>
          </span>
          <span className="studio-label ml-auto text-white/35 hidden sm:inline">
            EMS-01 · Master Console
          </span>
        </div>

        {/* Headline + tagline pulse */}
        <div className="mx-auto h-14 w-3/4 animate-pulse rounded-md studio-faceplate-dark" />
        <div className="mx-auto mt-4 h-5 w-2/3 animate-pulse rounded-md studio-faceplate-dark" />
        <div className="mx-auto mt-3 h-5 w-1/2 animate-pulse rounded-md studio-faceplate-dark" />

        {/* CTA pair pulse */}
        <div className="mx-auto mt-8 flex max-w-md gap-3">
          <div className="h-12 flex-1 animate-pulse rounded-md studio-faceplate-dark" />
          <div className="h-12 flex-1 animate-pulse rounded-md studio-faceplate-dark" />
        </div>

        {/* Now-spinning panel pulse */}
        <div className="mx-auto mt-10 h-32 w-full max-w-2xl animate-pulse rounded-xl studio-faceplate-dark" />
      </div>
    </section>
  );
}
