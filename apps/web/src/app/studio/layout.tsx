export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-studio-layout
      className="fixed inset-0 z-[1000] h-dvh w-screen overflow-hidden bg-[#05070a] text-white"
    >
      {children}
    </section>
  );
}
