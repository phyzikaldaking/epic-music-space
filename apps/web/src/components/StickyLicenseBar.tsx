"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LicenseButton from "@/components/LicenseButton";
import { formatPrice } from "@ems/utils";

interface Props {
  songId: string;
  songTitle: string;
  artistName: string;
  licensePrice: string;
  isAuthed: boolean;
  isSoldOut: boolean;
  isOwner: boolean;
}

/**
 * Mobile-first sticky purchase bar. Slides up from the bottom of the
 * screen when the primary in-page LicenseButton has scrolled out of
 * view, so a buyer doesn't have to scroll back to the top to commit.
 * Hidden on md+ where the in-page button is always visible in the
 * sidebar layout. Hidden for the artist viewing their own track and
 * for sold-out listings.
 */
export default function StickyLicenseBar(props: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (props.isOwner || props.isSoldOut) return;
    function onScroll() {
      // Show after the user has scrolled past 600px — usually past the
      // hero/cover and into the description/comments.
      setShow(window.scrollY > 600);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [props.isOwner, props.isSoldOut]);

  if (props.isOwner || props.isSoldOut || !show) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-16 z-30 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-hidden={!show}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/15 bg-[#0a0a0a]/95 p-2 shadow-2xl backdrop-blur-xl">
        <div className="min-w-0 flex-1 px-2">
          <p className="truncate text-xs font-bold text-white/85">{props.songTitle}</p>
          <p className="truncate text-[10px] text-white/45">
            {props.artistName} · License from {formatPrice(props.licensePrice)}
          </p>
        </div>
        <div className="flex-shrink-0">
          {props.isAuthed ? (
            <LicenseButton songId={props.songId} licensePrice={props.licensePrice} />
          ) : (
            <Link
              href={`/auth/signin?callbackUrl=/track/${props.songId}`}
              className="inline-block rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600"
            >
              Sign in to buy
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
