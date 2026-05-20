export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-studio-layout
      className="relative z-[1000] min-h-screen w-full overflow-x-auto overflow-y-visible bg-[#05070a] text-white"
    >
      {children}
    </section>
  );
}
