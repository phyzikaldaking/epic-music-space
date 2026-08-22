export function InputMeter({ peakDb, clipping }: { peakDb: number; clipping: boolean }) {
  const level = Number.isFinite(peakDb) ? Math.max(0, Math.min(100, ((peakDb + 60) / 60) * 100)) : 0;
  return <div className="preflight-meter" aria-label={clipping ? "Input clipping" : `Input level ${Math.round(peakDb)} decibels`}><span style={{ width: `${level}%` }} className={clipping ? "is-clipping" : ""}/></div>;
}
