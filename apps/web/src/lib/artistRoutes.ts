export function normalizeArtistHandle(value: string) {
  return value
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

export function artistProfileHref(handle?: string | null) {
  return `/artist/${normalizeArtistHandle(handle || "phyzikaldaking")}`;
}

export function artistEpkHref(handle?: string | null) {
  return `/epk/${normalizeArtistHandle(handle || "phyzikaldaking")}`;
}

export function artistMyspaceHref(handle?: string | null) {
  return `/myspace/${normalizeArtistHandle(handle || "phyzikaldaking")}`;
}

export function artistMetaverseHref(handle?: string | null) {
  return `/artist/${normalizeArtistHandle(handle || "phyzikaldaking")}#metaverse`;
}
