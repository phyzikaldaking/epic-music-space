"use client";

import { FormEvent, useMemo, useState } from "react";
import { AI_STUDIO_ROLES, type AiStudioRoleId } from "./aiStudioRoles";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AiStudioChatDockProps = {
  compact?: boolean;
  defaultRoleId?: AiStudioRoleId;
};

const STARTER_MESSAGES: Record<AiStudioRoleId, string> = {
  engineer: "I am your AI Engineer. Tell me what you are recording, what mic/interface you have, and whether you need help with levels, takes, punch-ins, or vocal chains.",
  producer: "I am your AI Producer. Tell me the emotion, tempo, artist lane, and reference energy. I will help shape the song structure and arrangement.",
  mix_doctor: "I am your AI Mix Doctor. Tell me what sounds wrong in the mix or give me your levels. I will diagnose vocal, low-end, master, and stereo problems.",
  mastering: "I am your AI Mastering Engineer. Tell me your release target: streaming, club, performance, battle, TikTok, broadcast, or sync.",
  publishing: "I am your AI Publishing Assistant. Give me the title, artist, collaborators, cover-art status, and release target. I will build the release checklist.",
  voice_command: "I am your Voice Command Studio. Try commands like start recording, punch in, open mix, save version, or publish this song.",
};

export default function AiStudioChatDock({ compact = false, defaultRoleId = "engineer" }: AiStudioChatDockProps) {
  const [roleId, setRoleId] = useState<AiStudioRoleId>(defaultRoleId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: STARTER_MESSAGES[defaultRoleId] },
  ]);

  const activeRole = useMemo(() => AI_STUDIO_ROLES.find((role) => role.id === roleId) ?? AI_STUDIO_ROLES[0], [roleId]);

  function changeRole(nextRoleId: AiStudioRoleId) {
    setRoleId(nextRoleId);
    setMessages((current) => [
      ...current,
      { id: `role-${Date.now()}`, role: "assistant", content: STARTER_MESSAGES[nextRoleId] },
    ]);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/studio/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, message: trimmed, history: messages.slice(-8) }),
      });
      const data = (await response.json()) as { ok?: boolean; reply?: string; error?: string; unavailable?: boolean };
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.reply ?? data.error ?? "AI Studio is not available right now. Check OPENAI_API_KEY in Vercel.",
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Could not reach AI Studio.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={`rounded-[2rem] border border-cyan-300/20 bg-slate-950/95 p-4 shadow-2xl shadow-cyan-950/25 ${compact ? "max-h-[720px]" : ""}`}>
      <header className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-cyan-200/75">AI Studio Dock</p>
          <h2 className="mt-1 text-2xl font-black text-white">{activeRole.name}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">{activeRole.promise}</p>
        </div>
        <select
          value={roleId}
          onChange={(event) => changeRole(event.target.value as AiStudioRoleId)}
          className="rounded-2xl border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-white outline-none focus:border-cyan-300/60"
        >
          {AI_STUDIO_ROLES.map((role) => (
            <option key={role.id} value={role.id}>{role.name}</option>
          ))}
        </select>
      </header>

      <div className="mt-4 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: compact ? 420 : 520 }}>
        {messages.map((message) => (
          <div key={message.id} className={`rounded-2xl border p-3 text-sm leading-6 ${message.role === "user" ? "ml-8 border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-50" : "mr-8 border-cyan-300/20 bg-cyan-300/10 text-cyan-50"}`}>
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-white/35">{message.role === "user" ? "Artist" : activeRole.shortName}</p>
            {message.content}
          </div>
        ))}
        {loading ? (
          <div className="mr-8 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">AI Studio is thinking...</div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {activeRole.starterPrompts.slice(0, 4).map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setInput(prompt)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/60 hover:border-cyan-300/40 hover:text-cyan-100"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 md:flex-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`Ask ${activeRole.shortName}...`}
          className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black/55 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-300/60"
        />
        <button disabled={loading || !input.trim()} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black uppercase tracking-[0.22em] text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
