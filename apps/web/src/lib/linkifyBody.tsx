import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Splits a post body into text + clickable hashtag chunks. A hashtag is
 * `#` followed by 1-50 chars of `[a-zA-Z0-9_]`. We keep the regex tight so
 * we don't grab e-mail-style fragments or hex colors. Tags are normalized
 * to lowercase in the URL so `#HipHop`, `#hiphop`, and `#HIPHOP` all
 * resolve to the same explore page.
 */
const HASHTAG_RE = /(^|\s)(#[A-Za-z0-9_]{1,50})/g;

export function linkifyBody(body: string): ReactNode[] {
  if (!body) return [];

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Reset state each call (the regex is module-scoped, /g).
  HASHTAG_RE.lastIndex = 0;

  while ((match = HASHTAG_RE.exec(body)) !== null) {
    const [, leading, tagWithHash] = match;
    const tagText = tagWithHash.slice(1); // drop the '#'
    const hashtagStart = match.index + leading.length;
    if (lastIndex < hashtagStart) {
      parts.push(body.slice(lastIndex, hashtagStart));
    }
    parts.push(
      <Link
        key={`${hashtagStart}-${tagText}`}
        href={`/explore?tag=${encodeURIComponent(tagText.toLowerCase())}`}
        className="text-brand-400 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {tagWithHash}
      </Link>,
    );
    lastIndex = hashtagStart + tagWithHash.length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

/**
 * Plain extraction — useful when a server route needs the list of tags
 * a post mentions (e.g. for `/api/posts?tag=` filtering).
 */
export function extractHashtags(body: string): string[] {
  if (!body) return [];
  const out: string[] = [];
  HASHTAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASHTAG_RE.exec(body)) !== null) {
    out.push(match[2].slice(1).toLowerCase());
  }
  return Array.from(new Set(out));
}
