import { ImageResponse } from "next/og";

export const alt = "Epic Music Space - The Fastest-Growing Social Platform for Music";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 68px",
          color: "#fff",
          fontFamily: "Arial, sans-serif",
          background:
            "radial-gradient(circle at 85% 25%, rgba(108,92,231,0.34), transparent 45%), radial-gradient(circle at 12% 85%, rgba(51,248,255,0.26), transparent 42%), linear-gradient(135deg, #0a0b14 0%, #141629 55%, #080a12 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, rgba(108,92,231,0.96), rgba(0,245,255,0.92))",
              fontSize: 30,
              fontWeight: 900,
              color: "#fff",
            }}
          >
            E
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#d9d4ff" }}>Epic Music Space</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              alignSelf: "flex-start",
              borderRadius: 999,
              border: "1px solid rgba(108,92,231,0.38)",
              background: "rgba(108,92,231,0.16)",
              padding: "9px 22px",
              fontSize: 17,
              fontWeight: 700,
              color: "rgba(255,255,255,0.8)",
              letterSpacing: 1,
            }}
          >
            MUSIC&apos;S FASTEST-GROWING SOCIAL PLATFORM
          </div>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1 }}>Connect. Compete.</div>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1, color: "#8beeff" }}>Go Viral.</div>
          <div style={{ fontSize: 29, color: "rgba(255,255,255,0.78)" }}>
            Discover rising artists, join live sessions, vote in battles, and support tracks directly.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Tag label="Versus Battles" />
          <Tag label="Live Rooms" />
          <Tag label="Fan Voting" />
          <Tag label="Trending Charts" />
        </div>
      </div>
    ),
    size,
  );
}

function Tag({ label }: { label: string }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.07)",
        padding: "10px 18px",
        fontSize: 21,
        fontWeight: 700,
        color: "rgba(255,255,255,0.92)",
      }}
    >
      {label}
    </div>
  );
}
