import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: string;
}

export function Badge({ className, color, children, style, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        "bg-white/10 text-white/80 border-white/20",
        className
      )}
      style={color ? { backgroundColor: `${color}30`, borderColor: `${color}60`, color } : style}
      {...props}
    >
      {children}
    </span>
  );
}
