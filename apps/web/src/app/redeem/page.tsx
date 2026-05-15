import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import RedeemForm from "./RedeemForm";

export const metadata: Metadata = {
  title: "Redeem Code | Epic Music Space",
  description: "Redeem an Epic Music Space invitation, access code, or creator credit on your account.",
  alternates: { canonical: "/redeem" },
  openGraph: { title: "Redeem an Epic Music Space Code", description: "Sign in to redeem invites, credits, perks, and private access codes.", url: "/redeem" },
};

type RedeemSearchParams = Promise<{ code?: string }>;

export default async function RedeemPage({ searchParams }: { searchParams: RedeemSearchParams }) {
  const [{ code: prefillCode }, session] = await Promise.all([searchParams, auth()]);
  const callbackUrl = "/redeem" + (prefillCode ? "?code=" + encodeURIComponent(prefillCode) : "");
  if (!session?.user?.id) {
    return (
      <main className="min-h-screen bg-black text-white"><section className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-20 sm:px-8"><div className="space-y-4"><p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-300">Redeem</p><h1 className="text-4xl font-black tracking-tight sm:text-6xl">Unlock the code on your account.</h1><p className="max-w-2xl text-lg leading-8 text-slate-300">Codes attach credits, access, or perks to a signed-in Epic Music Space account. Sign in first and we will keep your code ready.</p></div><div className="flex flex-wrap gap-3"><Link prefetch={false} href={"/auth/signin?callbackUrl=" + encodeURIComponent(callbackUrl)} className="rounded-full bg-white px-5 py-3 text-sm font-bold text-black">Sign in to redeem</Link><Link prefetch={false} href={"/auth/signup?callbackUrl=" + encodeURIComponent(callbackUrl)} className="rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white">Create account</Link></div></section></main>
    );
  }
  return <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-white"><header className="mb-8"><p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">Access</p><h1 className="mt-2 text-3xl font-black">Redeem a code</h1><p className="mt-3 text-slate-300">Apply invite codes, credits, and perks to your account.</p></header><RedeemForm initialCode={prefillCode ?? ""} /></main>;
}
