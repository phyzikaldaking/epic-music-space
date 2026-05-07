import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Epic Music Space - The Fastest-Growing Social Platform for Music";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0a0b14" />
          <stop offset="55%" stopColor="#141629" />
          <stop offset="100%" stopColor="#080a12" />
        </linearGradient>
        <radialGradient id="glowRight" cx="85%" cy="25%" r="45%">
          <stop offset="0%" stopColor="#6c5ce7" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#6c5ce7" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glowLeft" cx="12%" cy="85%" r="42%">
          <stop offset="0%" stopColor="#33f8ff" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#33f8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a89dff" />
          <stop offset="100%" stopColor="#66faff" />
        </linearGradient>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="1200" height="630" fill="url(#bgGrad)" />
      <rect width="1200" height="630" fill="url(#glowRight)" />
      <rect width="1200" height="630" fill="url(#glowLeft)" />
      <rect width="1200" height="630" fill="url(#grid)" opacity="0.45" />

      <rect x="68" y="56" width="62" height="62" rx="14" fill="rgba(108,92,231,0.22)" stroke="rgba(108,92,231,0.6)" />
      <text x="83" y="97" fontSize="30" fill="#66faff">♪</text>
      <text x="150" y="95" fontFamily="Inter, Arial, sans-serif" fontSize="34" fontWeight="800" fill="url(#brandGrad)">
        Epic Music Space
      </text>

      <rect x="68" y="145" width="495" height="40" rx="999" fill="rgba(108,92,231,0.16)" stroke="rgba(108,92,231,0.38)" />
      <text x="90" y="171" fontFamily="Inter, Arial, sans-serif" fontSize="17" fontWeight="700" fill="rgba(255,255,255,0.74)">
        MUSIC&apos;S FASTEST-GROWING SOCIAL PLATFORM
      </text>

      <text x="68" y="270" fontFamily="Inter, Arial, sans-serif" fontSize="76" fontWeight="900" fill="#ffffff">
        Connect. Compete.
      </text>
      <text x="68" y="352" fontFamily="Inter, Arial, sans-serif" fontSize="76" fontWeight="900" fill="url(#brandGrad)">
        Go Viral.
      </text>

      <text x="68" y="418" fontFamily="Inter, Arial, sans-serif" fontSize="29" fill="rgba(255,255,255,0.75)">
        Discover rising artists, join live sessions, vote in battles,
      </text>
      <text x="68" y="455" fontFamily="Inter, Arial, sans-serif" fontSize="29" fill="rgba(255,255,255,0.75)">
        and support tracks directly from the community.
      </text>

      <rect x="68" y="496" width="220" height="44" rx="10" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.16)" />
      <text x="94" y="524" fontFamily="Inter, Arial, sans-serif" fontSize="21" fontWeight="700" fill="rgba(255,255,255,0.92)">Versus Battles</text>

      <rect x="302" y="496" width="190" height="44" rx="10" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.16)" />
      <text x="338" y="524" fontFamily="Inter, Arial, sans-serif" fontSize="21" fontWeight="700" fill="rgba(255,255,255,0.92)">Live Rooms</text>

      <rect x="508" y="496" width="180" height="44" rx="10" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.16)" />
      <text x="537" y="524" fontFamily="Inter, Arial, sans-serif" fontSize="21" fontWeight="700" fill="rgba(255,255,255,0.92)">Fan Voting</text>

      <rect x="704" y="496" width="220" height="44" rx="10" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.16)" />
      <text x="729" y="524" fontFamily="Inter, Arial, sans-serif" fontSize="21" fontWeight="700" fill="rgba(255,255,255,0.92)">Trending Charts</text>

      <text x="68" y="590" fontFamily="Inter, Arial, sans-serif" fontSize="22" fill="rgba(255,255,255,0.58)">
        epicmusicspace.com • Music social networking reimagined
      </text>
    </svg>,
    size,
  );
}
