"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useStudioContext } from "@/lib/studioContextStore";
import { describeToolCall, type AiToolName } from "@/lib/aiTools";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Optional tool-call attached to this assistant message. When set,
   *  the widget renders an "Apply" / "Dismiss" confirm card. The user
   *  has to opt in before the engine acts on the model's suggestion. */
  toolCall?: {
    id: string;
    name: string;
    args: unknown;
    description: string;
    status: "pending" | "applied" | "dismissed";
  };
}

const QUICK_LINKS: Array<{ href: string; label: string; emoji: string }> = [
  { href: "/marketplace", label: "Marketplace", emoji: "🎧" },
  { href: "/forum", label: "Forum timeline", emoji: "📡" },
  { href: "/versus", label: "Versus battles", emoji: "⚔️" },
  { href: "/studio", label: "Studio rooms", emoji: "🎛️" },
  { href: "/pricing", label: "Pricing & plans", emoji: "💎" },
  { href: "/dashboard", label: "Dashboard", emoji: "📊" },
];

const STARTERS: string[] = [
  "How do I license a track?",
  "What's a Versus battle?",
  "How do payouts work?",
  "How do I upload my music?",
];

const STUDIO_STARTERS: string[] = [
  "How do I add a sound?",
  "What does this knob do?",
  "Help me make a trap beat",
  "Why does my mix sound muddy?",
  "Best BPM for boom-bap?",
];

const HIDDEN_PATH_PREFIXES = [
  "/", // homepage already has primary conversion actions
  "/ai", // dedicated chat page already on screen
  "/auth", // don't distract from sign-in / sign-up
  "/admin", // ops/admin tools
];

export default function ChatbotWidget() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const studioContext = useStudioContext();
  const isStudioRoute = Boolean(pathname?.startsWith("/studio"));
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const initialGreeting = useMemo<string>(() => {
    if (!isStudioRoute) {
      return "Hey! I'm the EMS guide. Pick a quick link below or ask me anything about the site — licensing, Versus battles, payouts, studios, anything.";
    }
    const bits: string[] = [];
    if (studioContext.bpm != null) bits.push(`${studioContext.bpm} BPM`);
    if (studioContext.beatKit) bits.push(`${studioContext.beatKit} kit`);
    if (studioContext.trackCount > 0) bits.push(`${studioContext.trackCount} tracks`);
    const ctxLine = bits.length > 0 ? ` I see you're at ${bits.join(", ")}.` : "";
    return `Studio Coach here.${ctxLine} Ask me anything about your session — knobs, mixing, beat-making, or how to use any control on screen.`;
  }, [isStudioRoute, studioContext.bpm, studioContext.beatKit, studioContext.trackCount]);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: initialGreeting },
  ]);

  // Refresh the seeded greeting when the user enters the studio mid-session
  // or the snapshot meaningfully changes — but only while the chat hasn't
  // really started yet, so we don't blow away an in-progress conversation.
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].role === "assistant"
        ? [{ role: "assistant", content: initialGreeting }]
        : prev,
    );
  }, [initialGreeting]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Studio Coach can dock as a right rail. Persisted per browser; only
  // applied while on /studio routes (collapses back to floating elsewhere).
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    try {
      setDocked(localStorage.getItem("ems.studio.coach.docked.v1") === "1");
    } catch {
      // ignore
    }
  }, []);
  function setDockedPersisted(value: boolean) {
    setDocked(value);
    try {
      localStorage.setItem("ems.studio.coach.docked.v1", value ? "1" : "0");
    } catch {
      // ignore
    }
  }
  const isDocked = isStudioRoute && docked;

  // Reflect dock state on <body> so layouts that need to shift (e.g. the
  // DAW container) can react via attribute selectors. Only applied when
  // the panel is open; closed panels behave like the floating bubble.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const shouldShift = isDocked && open;
    document.body.toggleAttribute("data-studio-coach-docked", shouldShift);
    return () => {
      document.body.removeAttribute("data-studio-coach-docked");
    };
  }, [isDocked, open]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hide on routes where the widget would compete with another full-page
  // experience or get in the way (admin tools, auth pages, the dedicated
  // /ai chat page).
  const hideOnThisRoute = HIDDEN_PATH_PREFIXES.some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname?.startsWith(`${p}/`),
  );

  useEffect(() => {
    if (open) {
      setUnread(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  // Close on Escape for keyboard users
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Allow other surfaces (the first-visit tour, per-track "Coach me"
  // buttons) to pop the chat open programmatically. An optional
  // detail.prefill is dropped into the input so the user only has to
  // press Enter — they get a track-specific question for free.
  useEffect(() => {
    function openCoach(event: Event) {
      const detail = (event as CustomEvent<{ prefill?: string }>).detail;
      setOpen(true);
      if (detail?.prefill) {
        setInput(detail.prefill);
        setTimeout(() => inputRef.current?.focus(), 60);
      }
    }
    window.addEventListener("studio:open-coach", openCoach);
    return () => window.removeEventListener("studio:open-coach", openCoach);
  }, []);

  if (hideOnThisRoute) return null;

  const isAuthed = status === "authenticated" && Boolean(session?.user?.id);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setError(null);

    if (!isAuthed) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Quick chat is for signed-in users only — but the navigation links above work for everyone. Sign in to keep talking.",
        },
      ]);
      return;
    }

    setLoading(true);
    // Seed an empty assistant message so the streaming caret has somewhere
    // to render even before the first token arrives.
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          studioContext: isStudioRoute ? studioContext : undefined,
        }),
      });

      if (res.status === 401) {
        replaceLastAssistant("Your session expired. Sign in again to keep chatting.");
        return;
      }
      if (res.status === 429) {
        replaceLastAssistant(
          "I'm getting too many questions at once — wait a minute and try again.",
        );
        return;
      }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        replaceLastAssistant(
          typeof data?.error === "string"
            ? data.error
            : "Sorry, I couldn't respond. Try again in a moment.",
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line. Split greedily and
        // keep any partial trailing event in the buffer.
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const dataLine = event
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice(5).trim();
          if (payload === "[DONE]") {
            buffer = "";
            break;
          }
          try {
            const parsed = JSON.parse(payload) as
              | { delta: string }
              | { error: string }
              | { tool: { id: string; name: string; args: unknown } };
            if ("delta" in parsed && parsed.delta) {
              appendToLastAssistant(parsed.delta);
            } else if ("tool" in parsed && parsed.tool) {
              attachToolCallToLastAssistant(parsed.tool);
            } else if ("error" in parsed) {
              appendToLastAssistant(`\n\n${parsed.error}`);
            }
          } catch {
            // Malformed event — ignore and keep streaming.
          }
        }
      }

      // If the model produced nothing at all, leave a fallback so the
      // user sees something instead of an empty bubble.
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role !== "assistant" || last.content) return prev;
        return [
          ...prev.slice(0, -1),
          { role: "assistant", content: "(no reply)" },
        ];
      });
    } catch {
      setError("Network error. Please try again.");
      replaceLastAssistant("Network error. Please try again.");
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }

  function replaceLastAssistant(content: string) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return [...prev, { role: "assistant", content }];
      return [...prev.slice(0, -1), { role: "assistant", content }];
    });
  }

  function appendToLastAssistant(delta: string) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") {
        return [...prev, { role: "assistant", content: delta }];
      }
      return [
        ...prev.slice(0, -1),
        { role: "assistant", content: last.content + delta },
      ];
    });
  }

  function attachToolCallToLastAssistant(tool: {
    id: string;
    name: string;
    args: unknown;
  }) {
    let description: string;
    try {
      description = describeToolCall(tool.name as AiToolName, tool.args);
    } catch {
      description = `Run ${tool.name}`;
    }
    setMessages((prev) => {
      if (prev.length === 0) {
        return [
          {
            role: "assistant",
            content: "",
            toolCall: { ...tool, description, status: "pending" },
          },
        ];
      }
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") {
        return [
          ...prev,
          {
            role: "assistant",
            content: "",
            toolCall: { ...tool, description, status: "pending" },
          },
        ];
      }
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          toolCall: { ...tool, description, status: "pending" },
        },
      ];
    });
  }

  function applyToolCall(messageIndex: number) {
    const msg = messages[messageIndex];
    if (!msg?.toolCall || msg.toolCall.status !== "pending") return;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("studio:execute-tool", {
          detail: { name: msg.toolCall.name, args: msg.toolCall.args },
        }),
      );
    }
    setMessages((prev) =>
      prev.map((m, i) =>
        i === messageIndex && m.toolCall
          ? { ...m, toolCall: { ...m.toolCall, status: "applied" } }
          : m,
      ),
    );
  }

  function dismissToolCall(messageIndex: number) {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === messageIndex && m.toolCall
          ? { ...m, toolCall: { ...m.toolCall, status: "dismissed" } }
          : m,
      ),
    );
  }

  return (
    <>
      {/* Floating bot button — sits above the mobile bottom nav (which
          adds 56px on mobile) so it doesn't overlap. */}
      {!open && (
        <button
          type="button"
          aria-label="Open EMS guide chat"
          data-tour="coach-bubble"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-[120] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 shadow-lg shadow-brand-500/30 ring-1 ring-white/10 hover:scale-105 active:scale-95 transition md:bottom-6 md:right-6"
        >
          <BotIcon className="h-7 w-7 text-white" />
          {unread && (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0a0a0a]" />
          )}
        </button>
      )}

      {/* Slide-out panel — floating bubble OR docked right-rail in studio */}
      {open && (
        <div
          role="dialog"
          aria-label="EMS guide chat"
          aria-modal="false"
          className={
            isDocked
              ? "fixed right-0 top-[64px] bottom-0 z-[120] flex w-[380px] flex-col overflow-hidden border-l border-white/10 bg-[#0c0c12]/95 shadow-2xl backdrop-blur-xl"
              : "fixed bottom-20 right-2 z-[120] flex w-[min(380px,calc(100vw-1rem))] max-h-[min(640px,calc(100vh-7rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c12]/95 shadow-2xl backdrop-blur-xl md:bottom-6 md:right-6"
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-brand-500/15 to-accent-500/15 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                <BotIcon className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <p className={`text-sm font-bold ${isStudioRoute ? "text-tube-300" : ""}`}>
                  {isStudioRoute ? "Studio Coach" : "EMS guide"}
                </p>
                <p className="text-[11px] text-white/50">
                  {isStudioRoute
                    ? isAuthed
                      ? "Reads your session · BPM, kit, tracks"
                      : "Sign in to coach this session"
                    : isAuthed
                      ? "Online · ask me anything"
                      : "Quick links + sign-in to chat"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isStudioRoute ? (
                <button
                  type="button"
                  onClick={() => setDockedPersisted(!docked)}
                  aria-label={isDocked ? "Pop coach out to bubble" : "Dock coach to right rail"}
                  className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
                  title={isDocked ? "Pop out" : "Dock right"}
                >
                  {isDocked ? "⇲" : "⇱"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick navigation chips — visible regardless of auth */}
          <div className="border-b border-white/10 px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Jump to
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/10 hover:border-white/20 transition"
                >
                  <span aria-hidden="true">{link.emoji}</span>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((msg, i) => {
              const isLastAssistant =
                msg.role === "assistant" && i === messages.length - 1;
              const isStreamingThis = streaming && isLastAssistant;
              return (
                <div
                  key={i}
                  className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {(msg.content || isStreamingThis) && (
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-brand-500 text-white rounded-br-sm"
                          : "bg-white/[0.07] text-white/90 rounded-bl-sm"
                      }`}
                    >
                      {msg.content}
                      {isStreamingThis && msg.content === "" && (
                        <span className="text-white/40 italic">Thinking…</span>
                      )}
                      {isStreamingThis && (
                        <span
                          aria-hidden
                          className="ml-0.5 inline-block h-3.5 w-1.5 -mb-0.5 animate-pulse bg-tube-300/80"
                        />
                      )}
                    </div>
                  )}
                  {msg.toolCall && (
                    <div className="max-w-[85%] rounded-xl border border-tube-300/35 bg-tube-300/10 px-3 py-2 text-xs">
                      <p className="font-bold text-tube-200">
                        ✨ The Coach can do this:
                      </p>
                      <p className="mt-0.5 text-white/85">
                        {msg.toolCall.description}
                      </p>
                      {msg.toolCall.status === "pending" ? (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => applyToolCall(i)}
                            className="rounded-md bg-tube-300/30 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-tube-100 hover:bg-tube-300/45 transition"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissToolCall(i)}
                            className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/55 hover:bg-white/10 transition"
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-white/55">
                          {msg.toolCall.status === "applied"
                            ? "✓ Applied"
                            : "Dismissed"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Conversation starters — show only when chat hasn't really started */}
            {messages.length <= 1 && !loading && (
              <div className="pt-1 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Try asking
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(isStudioRoute ? STUDIO_STARTERS : STARTERS).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => sendMessage(s)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
          </div>

          {/* Input */}
          {isAuthed ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="border-t border-white/10 bg-black/40 px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about the site…"
                  maxLength={1500}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="rounded-xl bg-brand-500 px-3.5 py-2 text-sm font-semibold hover:bg-brand-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Send"
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              </div>
            </form>
          ) : (
            <div className="border-t border-white/10 bg-black/40 px-4 py-3">
              <Link
                href={`/auth/signin?callbackUrl=${encodeURIComponent(pathname || "/")}`}
                onClick={() => setOpen(false)}
                className="flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold hover:bg-brand-600 transition"
              >
                Sign in to chat with the AI guide
              </Link>
              <p className="mt-2 text-center text-[10px] text-white/40">
                Browse links above without signing in.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 4v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="3.5" r="1" fill="currentColor" />
      <circle cx="9" cy="13" r="1.4" fill="currentColor" />
      <circle cx="15" cy="13" r="1.4" fill="currentColor" />
      <path d="M9 16.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2.5 12v2M21.5 12v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 12L20 4l-3 16-5-7-8.5-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
