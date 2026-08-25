import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Epic Music Space for support, partnership, legal, licensing, and marketplace questions.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Epic Music Space",
    description: "Reach the right Epic Music Space team for account support, licensing, partnerships, and marketplace help.",
    url: "/contact",
  },
};

const contactRoutes = [
  { title: "Account and creator support", copy: "Get help with sign-in, uploads, rooms, battles, studio setup, and marketplace activity.", href: "mailto:support@epicmusicspace.com", label: "support@epicmusicspace.com" },
  { title: "Licensing and legal", copy: "Reach us about licensing questions, rights, DMCA notices, and legal requests.", href: "mailto:legal@epicmusicspace.com", label: "legal@epicmusicspace.com" },
  { title: "Partnerships", copy: "Talk with us about label, studio, brand, venue, and platform partnerships.", href: "mailto:partners@epicmusicspace.com", label: "partners@epicmusicspace.com" },
];

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-20 sm:px-8 lg:px-10">
        <div className="max-w-3xl space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">Contact</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Talk to Epic Music Space.</h1>
          <p className="text-lg leading-8 text-slate-300">Pick the lane that fits your request and we will route it to the right team. For account-specific issues, include the email on your Epic Music Space account and any route or room link involved.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {contactRoutes.map((item) => (
            <a key={item.href} href={item.href} className="rounded-lg border border-white/10 bg-white/[0.04] p-6 transition hover:border-sky-300/50 hover:bg-white/[0.08]">
              <h2 className="text-xl font-bold text-white">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.copy}</p>
              <span className="mt-5 inline-flex text-sm font-semibold text-sky-300">{item.label}</span>
            </a>
          ))}
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-bold">Fast links</h2>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link prefetch={false} className="rounded-full bg-white px-4 py-2 text-slate-950" href="/support">Support center</Link>
            <Link prefetch={false} className="rounded-full border border-white/15 px-4 py-2 text-white" href="/license-agreement">License agreement</Link>
            <Link prefetch={false} className="rounded-full border border-white/15 px-4 py-2 text-white" href="/dmca">DMCA</Link>
            <Link prefetch={false} className="rounded-full border border-white/15 px-4 py-2 text-white" href="/auth/signin?callbackUrl=/dashboard">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
