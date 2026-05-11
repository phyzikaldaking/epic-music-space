import Link from "next/link";
import AiStudioChatDock from "@/components/daw/AiStudioChatDock";

export const metadata = {
  title: "AI Studio Chat",
  description: "Multi-role AI engineer, producer, mix doctor, mastering, publishing, and voice-command chat for Epic Music Space.",
};

export default function AiStudioChatPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.20),transparent_34%),linear-gradient(135deg,rgba(6,12,24,0.98),rgba(4,4,8,0.98)_50%,rgba(12,35,48,0.86))] p-6 shadow-2xl shadow-cyan-950/25 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.45em] text-cyan-200/80">Epic Music Space AI Dock</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">Talk to the studio team.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
                Switch between AI Engineer, Producer, Mix Doctor, Mastering, Publishing, and Voice Command roles. This route verifies the dock safely before embedding it directly into Studio Board.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/studio/ai" className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white/80 hover:bg-white/10">
                AI Studio
              </Link>
              <Link href="/studio/board" className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black hover:bg-cyan-200">
                Studio Board
              </Link>
            </div>
          </div>
        </section>

        <AiStudioChatDock />
      </div>
    </main>
  );
}
