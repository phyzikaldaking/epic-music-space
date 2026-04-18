"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "icon" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", children, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50":
              variant === "primary",
            "bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur-sm":
              variant === "secondary",
            "text-gray-400 hover:text-white hover:bg-white/10":
              variant === "ghost",
            "text-gray-400 hover:text-white hover:bg-white/10 rounded-full":
              variant === "icon",
            "bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/40":
              variant === "danger",
          },
          {
            "px-3 py-1.5 text-sm": size === "sm",
            "px-5 py-2.5 text-sm": size === "md",
            "px-7 py-3 text-base": size === "lg",
            "p-2": size === "icon",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
