"use client";

import { useEffect, useState } from "react";

const CHANNEL = "ems-studio-session-lock-v3";
const TAB_ID = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36);

export default function StudioMultiWindowGuard({ sessionId }: { sessionId: string }) {
  const [otherWindow, setOtherWindow] = useState(false);

  useEffect(() => {
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`${CHANNEL}-${sessionId}`) : null;
    const announce = () => channel?.postMessage({ type: "studio_presence", tabId: TAB_ID });
    const onMessage = (event: MessageEvent<{ type?: string; tabId?: string }>) => {
      if (event.data?.type === "studio_presence" && event.data.tabId !== TAB_ID) {
        setOtherWindow(true);
        channel?.postMessage({ type: "studio_presence_ack", tabId: TAB_ID });
      }
      if (event.data?.type === "studio_presence_ack" && event.data.tabId !== TAB_ID) setOtherWindow(true);
    };
    channel?.addEventListener("message", onMessage);
    announce();
    const timer = window.setTimeout(announce, 120);
    return () => { window.clearTimeout(timer); channel?.removeEventListener("message", onMessage); channel?.close(); };
  }, [sessionId]);

  if (!otherWindow) return null;
  return (
    <div role="alert" className="fixed inset-x-3 top-3 z-[200] mx-auto max-w-2xl rounded-xl border border-amber-300/45 bg-[#241b08]/95 px-4 py-3 text-amber-50 shadow-2xl backdrop-blur">
      <p className="text-xs font-black uppercase tracking-widest">Another Studio window is open</p>
      <p className="mt-1 text-xs text-amber-100/75">Use one window for this session. The newest save wins; close the other Studio tab before editing to prevent conflicting changes.</p>
    </div>
  );
}
