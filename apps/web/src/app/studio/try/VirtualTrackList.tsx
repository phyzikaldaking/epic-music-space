"use client";

import { memo, useMemo, useState } from "react";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  rowHeight?: number;
  height?: number;
  overscan?: number;
  children: (track: StudioTrack, index: number) => React.ReactNode;
};

function VirtualTrackList({ tracks, rowHeight = 112, height = 520, overscan = 3, children }: Props) {
  const [scrollTop, setScrollTop] = useState(0);
  const totalHeight = tracks.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(tracks.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  const visible = useMemo(() => tracks.slice(startIndex, endIndex), [tracks, startIndex, endIndex]);

  if (tracks.length <= 12) {
    return <div className="space-y-2 pb-4">{tracks.map((track, index) => children(track, index))}</div>;
  }

  return (
    <div className="relative overflow-y-auto overscroll-contain" style={{ height }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${startIndex * rowHeight}px)` }} className="absolute left-0 right-0 top-0 space-y-2 pb-4">
          {visible.map((track, offset) => children(track, startIndex + offset))}
        </div>
      </div>
    </div>
  );
}

export default memo(VirtualTrackList);
