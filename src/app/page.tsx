"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Music, TrendingUp, DollarSign, Rocket, Users, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/feed");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const features = [
    { icon: Music, title: "Upload & Stream", desc: "Share your music with the world. HD audio, instant playback." },
    { icon: DollarSign, title: "Sell Instantly", desc: "Fixed price, pay-what-you-want, or auction your tracks." },
    { icon: TrendingUp, title: "Fan Investment", desc: "Let fans buy ownership shares. Build your economy." },
    { icon: ShoppingBag, title: "Marketplace", desc: "Buy, resell, and flip songs on the open marketplace." },
    { icon: Users, title: "Social Ecosystem", desc: "Follow artists, comment, like, and build your fanbase." },
    { icon: Rocket, title: "3D City (Coming Soon)", desc: "Walk through a virtual city with your music playing." },
  ];

  return (
    <div className="min-h-screen p-6 space-y-16 pb-16">
      {/* Hero */}
      <section className="relative rounded-3xl overflow-hidden min-h-[400px] flex flex-col items-center justify-center text-center p-8"
        style={{ background: "linear-gradient(135deg, rgba(107,33,168,0.5) 0%, rgba(29,78,216,0.4) 50%, rgba(236,72,153,0.3) 100%)" }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050510]/80" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-600/30 border border-purple-500/30 text-purple-300 text-sm font-medium mb-6">
            <Rocket size={14} />
            Next-gen music platform
          </div>
          <h1 className="text-5xl sm:text-6xl font-black text-white leading-tight mb-4">
            The Universe<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400">
              of Music
            </span>
          </h1>
          <p className="text-gray-300 text-lg mb-8 max-w-xl mx-auto">
            Upload, sell, stream, and invest in music. Where artists make money and fans own the future.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="px-8 py-3.5 rounded-2xl bg-purple-600 text-white font-semibold text-lg hover:bg-purple-500 transition-all shadow-xl shadow-purple-500/30"
            >
              Start for free
            </Link>
            <Link
              href="/feed"
              className="px-8 py-3.5 rounded-2xl bg-white/10 border border-white/20 text-white font-semibold text-lg hover:bg-white/20 transition-all"
            >
              Explore music
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="text-2xl font-bold text-white text-center mb-8">Everything you need</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center mb-3">
                <Icon size={20} className="text-purple-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">{title}</h3>
              <p className="text-gray-400 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center">
        <h2 className="text-3xl font-bold text-white mb-3">Ready to launch?</h2>
        <p className="text-gray-400 mb-6">Join thousands of artists already earning on EMS.</p>
        <Link
          href="/register"
          className="inline-flex px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-2xl"
        >
          Create your account
        </Link>
      </section>
    </div>
  );
}
