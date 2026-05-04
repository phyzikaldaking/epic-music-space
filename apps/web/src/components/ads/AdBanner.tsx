"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

interface Props {
  placementId: string;
  title: string;
  mediaUrl: string;
  linkUrl: string | null;
  className?: string;
}

const SESSION_KEY = "ems-ad-session";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export default function AdBanner({
  placementId,
  title,
  mediaUrl,
  linkUrl,
  className,
}: Props) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const sentImpression = useRef(false);

  // Fire impression once the banner is at least 50% in view for 1s.
  useEffect(() => {
    if (!ref.current || sentImpression.current) return;

    const el = ref.current;
    let timer: number | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (!timer) {
              timer = window.setTimeout(() => {
                if (sentImpression.current) return;
                sentImpression.current = true;
                const sessionId = getSessionId();
                fetch(`/api/ads/${placementId}/impression`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessionId }),
                  keepalive: true,
                }).catch(() => {});
                observer.disconnect();
              }, 1000);
            }
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [placementId]);

  function handleClick() {
    const sessionId = getSessionId();
    fetch(`/api/ads/${placementId}/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      keepalive: true,
    }).catch(() => {});
  }

  const safeHref = linkUrl ?? "#";

  return (
    <a
      ref={ref}
      href={safeHref}
      target={linkUrl?.startsWith("http") ? "_blank" : undefined}
      rel={linkUrl?.startsWith("http") ? "noopener noreferrer sponsored" : undefined}
      onClick={handleClick}
      aria-label={`Sponsored: ${title}`}
      className={`group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/3 ${className ?? ""}`}
    >
      <div className="relative aspect-[8/1] w-full">
        <Image
          src={mediaUrl}
          alt={title}
          fill
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="object-cover transition group-hover:scale-105"
        />
      </div>
      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/70">
        Ad
      </span>
    </a>
  );
}
