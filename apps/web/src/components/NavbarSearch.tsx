"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NavbarSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} role="search" aria-label="Site search" className="hidden lg:block relative">
      <span className="sr-only">Search Epic Music Space</span>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="w-44 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm placeholder-white/30 focus:w-60 focus:border-brand-500/40 focus:outline-none transition-all"
        aria-label="Search"
      />
    </form>
  );
}
