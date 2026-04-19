import Link from "next/link";
import { auth } from "@/lib/auth";
export default async function Navbar() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const session = await auth();
    return (<nav className="sticky top-0 z-50 border-b border-white/8 bg-[#0a0a0a]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 font-extrabold text-xl tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-lg glow-purple-sm border border-brand-500/30">
            🎵
          </span>
          <span className="text-gradient-ems">Epic Music Space</span>
        </Link>

        {/* Nav links */}
        <div className="hidden items-center gap-1 text-sm font-medium md:flex">
          {[
            { href: "/marketplace", label: "Marketplace" },
            { href: "/city", label: "City" },
            { href: "/versus", label: "Versus" },
            { href: "/leaderboard", label: "Charts" },
            { href: "/label", label: "Labels" },
            { href: "/ai", label: "AI" },
            { href: "/pricing", label: "Pricing" },
        ].map((link) => (<Link key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-white/60 transition hover:bg-white/6 hover:text-white">
              {link.label}
            </Link>))}
          {session && (<Link href="/dashboard" className="rounded-lg px-3 py-2 text-white/60 transition hover:bg-white/6 hover:text-white">
              Dashboard
            </Link>)}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {session ? (<div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-brand-400">
                  {(_e = ((_d = (_b = (_a = session.user) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : (_c = session.user) === null || _c === void 0 ? void 0 : _c.email) !== null && _d !== void 0 ? _d : "?")[0]) === null || _e === void 0 ? void 0 : _e.toUpperCase()}
                </div>
                <span className="text-sm text-white/55">
                  {(_g = (_f = session.user) === null || _f === void 0 ? void 0 : _f.name) !== null && _g !== void 0 ? _g : (_h = session.user) === null || _h === void 0 ? void 0 : _h.email}
                </span>
              </div>
              <form action="/api/auth/signout" method="POST">
                <button type="submit" className="rounded-lg border border-white/15 px-4 py-1.5 text-sm hover:bg-white/8 transition text-white/70 hover:text-white">
                  Sign out
                </button>
              </form>
            </div>) : (<>
              <Link href="/auth/signin" className="rounded-lg border border-white/15 px-4 py-1.5 text-sm text-white/70 hover:bg-white/8 hover:text-white transition">
                Sign in
              </Link>
              <Link href="/auth/signup" className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-600 glow-purple-sm">
                Get started
              </Link>
            </>)}
        </div>
      </div>
    </nav>);
}
