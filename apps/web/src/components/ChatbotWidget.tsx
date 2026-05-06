"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_LINKS: Array<{ href: string; label: string; emoji: string }> = [
  { href: "/marketplace", label: "Marketplace", emoji: "🎧" },
  { href: "/feed", label: "Feed", emoji: "📡" },
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

const HIDDEN_PATH_PREFIXES = [
  "/ai", // dedicated chat page already on screen
  "/auth", // don't distract from sign-in / sign-up
  "/admin", // ops/admin tools
];

export default function ChatbotWidget() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hey! I'm the EMS guide. Pick a quick link below or ask me anything about the site — licensing, Versus battles, payouts, studios, anything.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hide on routes where the widget would compete with another full-page
  // experience or get in the way (admin tools, auth pages, the dedicated
  // /ai chat page).
  const hideOnThisRoute = HIDDEN_PATH_PREFIXES.some((p) =>
    pathname === p || pathname?.startsWith(`${p}/`),
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
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (res.status === 401) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Your session expired. Sign in again to keep chatting.",
          },
        ]);
        return;
      }

      if (res.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I'm getting too many questions at once — wait a minute and try again.",
          },
        ]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              typeof data?.error === "string"
                ? data.error
                : "Sorry, I couldn't respond. Try again in a moment.",
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "(no reply)" },
      ]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating bot button — sits above the mobile bottom nav (which
          adds 56px on mobile) so it doesn't overlap. */}
      {!open && (
        <button
          type="button"
          aria-label="Open EMS guide chat"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-[120] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 shadow-lg shadow-brand-500/30 ring-1 ring-white/10 hover:scale-105 active:scale-95 transition md:bottom-6 md:right-6"
        >
          <BotIcon className="h-7 w-7 text-white" />
          {unread && (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0a0a0a]" />
          )}
        </button>
      )}

      {/* Slide-out panel */}
      {open && (
        <div
          role="dialog"
          aria-label="EMS guide chat"
          aria-modal="false"
          className="fixed bottom-20 right-2 z-[120] flex w-[min(380px,calc(100vw-1rem))] max-h-[min(640px,calc(100vh-7rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c12]/95 shadow-2xl backdrop-blur-xl md:bottom-6 md:right-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-brand-500/15 to-accent-500/15 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                <BotIcon className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold">EMS guide</p>
                <p className="text-[11px] text-white/50">
                  {isAuthed ? "Online · ask me anything" : "Quick links + sign-in to chat"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
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
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand-500 text-white rounded-br-sm"
                      : "bg-white/[0.07] text-white/90 rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-white/[0.07] px-3.5 py-2 text-sm text-white/50">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}

            {/* Conversation starters — show only when chat hasn't really started */}
            {messages.length <= 1 && !loading && (
              <div className="pt-1 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Try asking
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
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
