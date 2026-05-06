export function buildContentSecurityPolicy(nonce: string, env = process.env.NODE_ENV) {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "https://js.stripe.com",
    env === "development" ? "'unsafe-eval'" : null,
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://epicmusicspace.com https://www.epicmusicspace.com https://*.amazonaws.com https://*.supabase.co https://lh3.googleusercontent.com https://images.unsplash.com https://image.mux.com",
    "media-src 'self' blob: https://*.amazonaws.com https://*.supabase.co https://stream.mux.com https://*.mux.com",
    "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.stripe.com https://checkout.stripe.com https://stream.mux.com https://*.mux.com https://*.litix.io",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://*.mux.com https://www.youtube.com https://player.vimeo.com https://w.soundcloud.com https://open.spotify.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "font-src 'self' https://fonts.gstatic.com",
    "worker-src 'self' blob:",
  ].join("; ");
}
