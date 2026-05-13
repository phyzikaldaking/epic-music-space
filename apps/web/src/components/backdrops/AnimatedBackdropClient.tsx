"use client";

/**
 * Production-safe no-op for the animated canvas backdrop.
 *
 * The previous implementation used next/dynamic with `{ ssr: false }` for a
 * decorative particle canvas. On the public homepage this contributed to a
 * client-render bailout marker and forced extra JavaScript into the first
 * paint path. For launch reliability, keep the visual surface server-rendered
 * and compact. We can reintroduce a non-blocking canvas later after the live
 * audit is clean.
 */

type Props = {
  variant: "hero" | "versus" | "vault";
  className?: string;
};

export default function AnimatedBackdropClient(_props: Props) {
  return null;
}
