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
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label="Site search"
      className="relative hidden xl:block"
    >
      <span className="sr-only">Search Epic Music Space</span>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="w-36 border-b border-white/15 bg-transparent px-1 py-2 text-xs text-[#f2ede3] placeholder:text-white/30 focus:w-48 focus:border-[#c9a96e] focus:outline-none transition-all"
        aria-label="Search"
      />
    </form>
  );
}
