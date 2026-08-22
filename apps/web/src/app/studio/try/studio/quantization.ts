import type { TransientMarker } from "./audioAnalysis";

export function quantizeTransientMarkers(markers: TransientMarker[], options: {
  gridFrames: number;
  strength: number;
  maxShiftFrames?: number;
}) {
  const grid = Math.max(1, Math.round(options.gridFrames));
  const strength = Math.max(0, Math.min(1, options.strength));
  const maximum = Math.max(0, Math.round(options.maxShiftFrames ?? Number.MAX_SAFE_INTEGER));
  const after = strength === 0 ? markers : markers.map((marker) => {
    const target = Math.round(marker.frame / grid) * grid;
    const fullShift = Math.max(-maximum, Math.min(maximum, target - marker.frame));
    const frame = Math.max(0, Math.round(marker.frame + fullShift * strength));
    return frame === marker.frame ? marker : { ...marker, frame, edited: true };
  });
  return { label: "Quantize audio transients", before: markers, after, undo: markers, strength, gridFrames: grid };
}
