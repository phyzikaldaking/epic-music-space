"use client";

export function RegionPanel({
  selectionStart,
  selectionEnd,
  setSelectionStart,
  setSelectionEnd,
  loop,
  setLoop,
}: {
  selectionStart: number;
  selectionEnd: number;
  setSelectionStart: (value: number) => void;
  setSelectionEnd: (value: number) => void;
  loop: boolean;
  setLoop: (value: boolean) => void;
}) {
  const duration = Math.max(0, selectionEnd - selectionStart);

  return (
    <div className="border-t border-black bg-[#1a1d22] p-3 text-xs uppercase tracking-widest text-white/55">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-cyan-200">Loop Region</b>
        <button
          onClick={() => setLoop(!loop)}
          className={loop ? "bg-green-400 px-2 py-1 font-black text-black" : "bg-[#30343b] px-2 py-1 font-black text-white"}
        >
          {loop ? "Loop On" : "Loop Off"}
        </button>
      </div>

      <label className="block">
        Start {selectionStart.toFixed(2)}s
        <input
          type="range"
          min="0"
          max="600"
          step="0.01"
          value={selectionStart}
          onChange={(event) => setSelectionStart(Number(event.target.value))}
          className="w-full accent-cyan-300"
        />
      </label>

      <label className="mt-2 block">
        End {selectionEnd.toFixed(2)}s
        <input
          type="range"
          min="0"
          max="600"
          step="0.01"
          value={selectionEnd}
          onChange={(event) => setSelectionEnd(Number(event.target.value))}
          className="w-full accent-purple-300"
        />
      </label>

      <div className="mt-3 border border-black bg-black/40 p-2 text-[10px] text-white/60">
        Region Duration: {duration.toFixed(2)}s
      </div>
    </div>
  );
}
