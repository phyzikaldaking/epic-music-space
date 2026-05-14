"use client";

import { memo } from "react";

type Props = {
  label: string;
  children: React.ReactNode;
};

function StudioLazyPanel({ label, children }: Props) {
  return (
    <div className="min-h-[680px] rounded-xl border border-white/10 bg-black/25 p-2">
      <div className="mb-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
        {label}
      </div>
      {children}
    </div>
  );
}

export default memo(StudioLazyPanel);
