import { ImageResponse } from "next/og";

// Per-beat accent colours
const ACCENTS: Record<string, [string, string]> = {
  "cmoqn76pw000b9i9dx1cfpf4t": ["#ff4d4d", "#7f0000"],   // Dog Food — red
  "cmoqn762w00059i9dumd88h10": ["#f59e0b", "#78350f"],   // Bankston Brothers — amber
  "cmoqn769s00079i9d776t28f9": ["#34d399", "#064e3b"],   // Bodega — green
  "cmoqn76ys000d9i9dkby2uuqr": ["#a78bfa", "#3b0764"],   // Pay Like You Weigh — purple
  "cmoqn75u100039i9dprlfes2c": ["#38bdf8", "#0c4a6e"],   // Back Then Drunk — sky blue
  "cmoqn76iw00099i9d1tt0a5ee": ["#fb923c", "#431407"],   // Clear the Record — orange
};

// Static song metadata — avoids DB call in edge runtime
const SONGS: Record<string, { title: string; genre: string; bpm: number }> = {
  "cmoqn76pw000b9i9dx1cfpf4t": { title: "Dog Food", genre: "Raw Trap", bpm: 144 },
  "cmoqn762w00059i9dumd88h10": { title: "Bankston Brothers", genre: "Southern Pressure", bpm: 96 },
  "cmoqn769s00079i9d776t28f9": { title: "Bodega", genre: "Corner Rap", bpm: 98 },
  "cmoqn76ys000d9i9dkby2uuqr": { title: "Pay Like You Weigh", genre: "Player Music", bpm: 100 },
  "cmoqn75u100039i9dprlfes2c": { title: "Back Then Drunk", genre: "Street Soul", bpm: 92 },
  "cmoqn76iw00099i9d1tt0a5ee": { title: "Clear the Record", genre: "Courtroom Grit", bpm: 88 },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const song = SONGS[id];
  const title = song?.title ?? "Phyzikal Beat";
  const genre = song?.genre ?? "";
  const bpm = song?.bpm ?? null;
  const [accent, shadow] = ACCENTS[id] ?? ["#00f5ff", "#002b3d"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: `radial-gradient(circle at 30% 30%, ${accent}33, transparent 55%), linear-gradient(160deg, #07090d 0%, #101225 55%, ${shadow} 100%)`,
          color: "white",
          padding: 60,
          fontFamily: "Inter, Arial, sans-serif",
          position: "relative",
        }}
      >
        {/* Accent glow circle */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accent}55, transparent 70%)`,
          }}
        />

        {/* EMS badge top-left */}
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 60,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
              color: "#07090d",
            }}
          >
            E
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, opacity: 0.75 }}>
            EPIC MUSIC SPACE
          </span>
        </div>

        {/* Genre + BPM tag */}
        {genre ? (
          <div style={{ display: "flex", marginBottom: 16 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: accent,
                textTransform: "uppercase",
                letterSpacing: 3,
              }}
            >
              {genre}
              {bpm ? `  ·  ${bpm} BPM` : ""}
            </span>
          </div>
        ) : null}

        {/* Beat title */}
        <div
          style={{
            fontSize: title.length > 16 ? 64 : 80,
            fontWeight: 900,
            lineHeight: 1.05,
            textShadow: `0 4px 32px ${accent}88`,
          }}
        >
          {title}
        </div>

        {/* Artist */}
        <div
          style={{
            marginTop: 18,
            fontSize: 28,
            fontWeight: 600,
            opacity: 0.55,
            letterSpacing: 3,
          }}
        >
          PHYZIKAL
        </div>
      </div>
    ),
    { width: 800, height: 800 },
  );
}
