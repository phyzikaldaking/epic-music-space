import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
  width: 64,
  height: 64,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        background:
          "linear-gradient(135deg, rgba(108,92,231,0.96), rgba(0,245,255,0.92))",
        color: "white",
      }}
    >
      <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
      </svg>
    </div>,
    size,
  );
}
