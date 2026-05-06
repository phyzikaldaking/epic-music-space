import { Suspense } from "react";
import MagicLinkClient from "./MagicLinkClient";

export const dynamic = "force-dynamic";

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<MagicLinkShell title="Signing you in…" />}>
      <MagicLinkClient />
    </Suspense>
  );
}

function MagicLinkShell({ title }: { title: string }) {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center">
        <h1 className="mb-2 text-2xl font-extrabold">{title}</h1>
        <p className="text-sm text-white/50">Hold tight — this only takes a moment.</p>
      </div>
    </div>
  );
}
