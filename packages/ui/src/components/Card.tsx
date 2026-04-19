import * as React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  children,
  className = "",
  hover = false,
  padding = "md",
}: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-[#2A2A3A] bg-[rgba(19,19,26,0.8)] backdrop-blur-sm",
        paddingClasses[padding],
        hover ? "transition-all duration-150 hover:border-[#D4AF37]/30 hover:scale-[1.01] cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
