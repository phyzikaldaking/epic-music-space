export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <section data-studio-layout className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-[#05070a] text-white">
      {children}
    </section>
  );
}
