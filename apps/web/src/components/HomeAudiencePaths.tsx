import Link from "next/link";

const PATHS = [
  {
    role: "Artist",
    href: "/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew",
    title: "Make, publish, and get paid",
    body: "Start in the studio, claim a profile, upload a track, and set license terms.",
    steps: ["Studio", "Profile", "Upload", "Payouts"],
  },
  {
    role: "Buyer",
    href: "/marketplace",
    title: "Find rights without confusion",
    body: "Compare price, supply, revenue share, and usage terms before checkout.",
    steps: ["Search", "Compare", "License", "Receipt"],
  },
  {
    role: "Listener",
    href: "/auth/signup?role=LISTENER&callbackUrl=%2Ffeed%3Fonboarding%3Dlistener",
    title: "Follow music before it breaks",
    body: "Save tracks, join drops, vote in battles, and build a taste profile.",
    steps: ["Follow", "Save", "Vote", "Digest"],
  },
] as const;

export default function HomeAudiencePaths() {
  return (
    <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Choose your path">
      {PATHS.map((path) => (
        <Link
          key={path.role}
          href={path.href}
          className="home-panel group block px-5 py-5 transition hover:-translate-y-0.5"
        >
          <p className="home-kicker">
            <span className="num">{path.role}</span>
          </p>
          <h2 className="font-display text-2xl uppercase tracking-wide text-white">
            {path.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/62">{path.body}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {path.steps.map((step) => (
              <span
                key={step}
                className="home-chip px-2.5 py-1 studio-label text-white/50"
              >
                {step}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold text-tube-400 underline decoration-dotted underline-offset-4 group-hover:text-tube-300">
            Start as {path.role} →
          </p>
        </Link>
      ))}
    </section>
  );
}
