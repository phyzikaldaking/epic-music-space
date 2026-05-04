import type { Metadata } from "next";
import SearchClient from "./SearchClient";

export const metadata: Metadata = {
  title: "Search — Epic Music Space",
  description: "Find tracks, artists, producers, and engineers on Epic Music Space.",
};

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-extrabold">Search</h1>
      <SearchClient initialPromise={searchParams} />
    </div>
  );
}
