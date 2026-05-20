import type { ReactNode } from "react";

export default function StudioPageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main
      id="main-content"
      data-studio-content
      data-ems-workspace
      className={`relative min-h-screen min-w-[1440px] overflow-x-auto overflow-y-visible overscroll-auto bg-[#05070a] pb-24 text-white ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 opacity-80 [background:radial-gradient(circle_at_18%_12%,rgba(23,255,244,.16),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(255,52,223,.12),transparent_30%),linear-gradient(135deg,#05070a,#10151a_48%,#050609)]"
      />
      {children}
    </main>
  );
}
