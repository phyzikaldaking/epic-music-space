import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Epic Music Space cinematic music licensing";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "radial-gradient(circle at 78% 22%, rgba(0,245,255,0.22), transparent 32%), linear-gradient(125deg, #07090d 0%, #101225 48%, #050507 100%)",
        color: "white",
        padding: 72,
        fontFamily: "Inter, Arial, sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.16,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            border: "1px solid rgba(102,250,255,0.45)",
            background: "rgba(108,92,231,0.24)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#66faff",
          }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: 0,
            background: "linear-gradient(90deg, #9b8fff, #33f8ff)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Epic Music Space
        </div>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            color: "#33f8ff",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          Cinematic music licensing
        </div>
        <div
          style={{
            maxWidth: 900,
            fontSize: 78,
            lineHeight: 0.98,
            fontWeight: 900,
            letterSpacing: 0,
          }}
        >
          License epic space tracks in minutes.
        </div>
        <div
          style={{
            maxWidth: 760,
            marginTop: 28,
            color: "rgba(255,255,255,0.68)",
            fontSize: 27,
            lineHeight: 1.4,
          }}
        >
          Preview independent music, compare rights, and buy digital licenses
          with clear terms.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 18,
          color: "rgba(255,255,255,0.78)",
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        <span>Listen first</span>
        <span style={{ color: "rgba(255,255,255,0.28)" }}>/</span>
        <span>Review rights</span>
        <span style={{ color: "rgba(255,255,255,0.28)" }}>/</span>
        <span>License clearly</span>
      </div>
    </div>,
    size,
  );
}
