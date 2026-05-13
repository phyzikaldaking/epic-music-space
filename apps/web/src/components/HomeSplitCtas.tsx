import Link from "next/link";

type Placement = "hero" | "closing";

interface HomeSplitCtasProps {
  placement: Placement;
  containerClassName?: string;
  artistClassName: string;
  listenerClassName: string;
}

export default function HomeSplitCtas({
  placement,
  containerClassName,
  artistClassName,
  listenerClassName,
}: HomeSplitCtasProps) {
  if (placement === "hero") {
    return (
      <div className={containerClassName}>
        <Link href="/studio/try" className={artistClassName}>
          Open the Studio Free →
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
          <Link
            href="/marketplace"
            className="underline decoration-dotted underline-offset-4 hover:text-white/75"
          >
            Browse catalog
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/auth/signup?role=ARTIST"
            className="underline decoration-dotted underline-offset-4 hover:text-white/75"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <Link href="/auth/signup?role=ARTIST" className={artistClassName}>
        Start as Artist →
      </Link>
      <Link href="/auth/signup?role=LISTENER" className={listenerClassName}>
        Explore as Listener →
      </Link>
    </div>
  );
}
