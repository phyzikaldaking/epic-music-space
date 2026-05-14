"use client";

import { Profiler, memo, type ProfilerOnRenderCallback } from "react";

const SLOW_COMMIT_MS = 12;
const enabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_STUDIO_PROFILER === "1";

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration) => {
  if (!enabled || actualDuration < SLOW_COMMIT_MS) return;
  console.info(`[studio-profiler] ${id}`, {
    phase,
    actualDuration: Number(actualDuration.toFixed(2)),
    baseDuration: Number(baseDuration.toFixed(2)),
  });
};

type Props = {
  id: string;
  children: React.ReactNode;
};

function StudioProfiler({ id, children }: Props) {
  if (!enabled) return <>{children}</>;
  return <Profiler id={id} onRender={onRender}>{children}</Profiler>;
}

export default memo(StudioProfiler);
