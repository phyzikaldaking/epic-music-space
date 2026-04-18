"use client";

import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  glow?: boolean;
}

export function Card({ className, hover = true, glow = false, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm",
        hover && "transition-all duration-300 hover:bg-white/10 hover:border-white/20 cursor-pointer",
        glow && "shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
