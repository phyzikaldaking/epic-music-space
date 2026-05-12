"use client";

interface SpotlightStepWithVideo {
  id: string;
  title: string;
  body: string;
  loopVideoUrl?: string; // e.g., "/tour/play.webm"
  target?: HTMLElement;
  align?: "top" | "bottom" | "left" | "right";
}

export function SpotlightStepCard({
  step,
  onNext,
  onSkip,
}: {
  step: SpotlightStepWithVideo;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="absolute left-4 top-16 z-50 w-80 rounded-lg border border-white/20 bg-[#0c0c14] p-4 shadow-2xl">
      {/* Optional Video Loop */}
      {step.loopVideoUrl && (
        <div className="mb-3 rounded-lg overflow-hidden bg-black">
          <video
            src={step.loopVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-32 object-cover"
          />
        </div>
      )}

      {/* Content */}
      <h3 className="text-sm font-bold text-white">{step.title}</h3>
      <p className="mt-2 text-xs text-white/70 leading-relaxed">{step.body}</p>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={onSkip}
          className="flex-1 px-3 py-2 text-xs rounded border border-white/20 text-white/60 hover:bg-white/10"
        >
          Skip Tour
        </button>
        <button
          onClick={onNext}
          className="flex-1 px-3 py-2 text-xs rounded bg-tube-300 text-black font-bold hover:bg-tube-200"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export const spotlightTourSteps: SpotlightStepWithVideo[] = [
  {
    id: "welcome",
    title: "Welcome to Studio",
    body: "Create beats, record instruments, and mix tracks — all in your browser.",
    loopVideoUrl: "/tour/welcome.webm", // Asset: 5-10s intro animation
    align: "bottom",
  },
  {
    id: "play",
    title: "Press Play",
    body: "Start the beat machine or click play to hear your project.",
    loopVideoUrl: "/tour/play.webm", // Asset: Screen recording of play button
    align: "left",
  },
  {
    id: "record",
    title: "Record Your Voice",
    body: "Hit the record button and sing or hum — your voice becomes a track.",
    loopVideoUrl: "/tour/record.webm", // Asset: Recording interface demo
    align: "right",
  },
  {
    id: "mix",
    title: "Mix and Master",
    body: "Adjust levels, EQ, and effects. The master limiter protects your mix.",
    loopVideoUrl: "/tour/mix.webm", // Asset: Fader adjustment demo
    align: "bottom",
  },
  {
    id: "publish",
    title: "Publish and Share",
    body: "Export your mix, generate cover art, and share with the world.",
    loopVideoUrl: "/tour/publish.webm", // Asset: Publish flow demo
    align: "top",
  },
];
