"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

interface StudioTooltipProps {
  label: ReactNode;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayMs?: number;
  children: ReactNode;
  asChild?: boolean;
  disabled?: boolean;
}

export function StudioTooltip({
  label,
  shortcut,
  side = "top",
  align = "center",
  delayMs = 250,
  children,
  asChild = true,
  disabled = false,
}: StudioTooltipProps) {
  if (disabled || (!label && !shortcut)) return <>{children}</>;
  return (
    <Tooltip.Root delayDuration={delayMs}>
      <Tooltip.Trigger asChild={asChild}>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="pointer-events-none z-[200] max-w-[280px] rounded-md border border-tube-300/35 bg-[#0a0a10]/95 px-2.5 py-1.5 text-[11px] leading-snug font-mono text-tube-300 shadow-[0_0_24px_rgba(255,184,77,0.18)] backdrop-blur-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-50"
        >
          <span className="text-white/85">{label}</span>
          {shortcut ? (
            <kbd className="ml-2 inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-tube-300">
              {shortcut}
            </kbd>
          ) : null}
          <Tooltip.Arrow className="fill-tube-300/40" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const StudioTooltipProvider = Tooltip.Provider;
