import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import CreatePlaylistButton from "./CreatePlaylistButton";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Playlists | Epic Music Space",
  description: "Collect, organize, and replay your favorite Epic Music Space tracks in private playlists.",
  alternates: { canonical: "/playlists" },
  openGraph: { title: "Playlists on Epic Music Space", description: "Sign in to build playlists from tracks, rooms, battles, and marketplace finds.", url: "/playlists" },
};

export default async function PlaylistsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return (
      <main className="min-h-screen bg-black text-white">
        <section className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-20 sm:px-8">
          <div className="space-y-4"><p className="text-sm font-semibold uppercase tracking-[0.28em] text-fuchsia-300">Playlists</p><h1 className="text-4xl font-black tracking-tight sm:text-6xl">Keep your next set ready.</h1><p className="max-w-2xl text-lg leading-8 text-slate-300">Playlists are saved to your account so your crates, references, and room-ready picks follow you across devices.</p></div>
          <div className="flex flex-wrap gap-3"><Link prefetch={false} href="/auth/signin?callbackUrl=/playlists" className="rounded-full bg-white px-5 py-3 text-sm font-bold text-black">Sign in to view playlists</Link><Link prefetch={false} href="/auth/signup?callbackUrl=/playlists" className="rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white">Create account</Link></div>
        </section>
      </main>
    );
  }
  const playlists = await prisma.playlist.findMany({ where: { userId }, include: { _count: { select: { items: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 text-white">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-fuchsia-300">Your library</p><h1 className="mt-2 text-3xl font-black">Playlists</h1></div><CreatePlaylistButton /></header>
      {playlists.length === 0 ? <section className="mt-10 rounded-lg border border-white/10 bg-white/[0.04] p-8 text-slate-300"><h2 className="text-xl font-bold text-white">No playlists yet</h2><p className="mt-2 max-w-2xl">Create your first playlist, then save tracks from the marketplace and timeline.</p></section> : <section className="mt-10 grid gap-4 sm:grid-cols-2">{playlists.map((playlist) => <Link prefetch={false} key={playlist.id} href={"/playlists/" + playlist.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-5 transition hover:border-fuchsia-300/50 hover:bg-white/[0.08]"><h2 className="text-xl font-bold text-white">{playlist.name}</h2><p className="mt-2 text-sm text-slate-400">{playlist._count.items} tracks</p></Link>)}</section>}
    </main>
  );
}
