import * as React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = "", ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-400 mb-2"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            "w-full bg-[#0A0A0F] border rounded-lg px-4 py-3 text-[#F0F0F0] placeholder-gray-600",
            "focus:outline-none focus:ring-1 transition-colors",
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-500/30"
              : "border-[#2A2A3A] focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/30",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-xs text-gray-600">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
