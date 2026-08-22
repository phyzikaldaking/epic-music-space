"use client";

export function MixAssistant({ clipping, onApply }: { clipping: boolean; onApply: (volume: number) => void }) {
  return <section className="mix-assistant">
    <div className="mix-panel__heading"><span>MIX ASSISTANT</span><b>Opt-in</b></div>
    <p>{clipping ? "This channel is clipping. Lowering its fader creates headroom without changing the source audio." : "Create more headroom and a steadier starting balance. You can undo every suggestion."}</p>
    <button onClick={() => onApply(clipping ? 68 : 74)}>Preview suggestion</button>
    <small>Nothing changes until you apply it. Studio history keeps the previous value.</small>
  </section>;
}
