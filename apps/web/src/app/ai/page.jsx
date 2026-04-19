"use client";
import { useState, useRef } from "react";
export default function AiPage() {
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            content: "Hey! I'm the EMS AI assistant. I can help you discover songs to license, understand how the platform works, and answer questions about artists, Versus battles, and more. What would you like to know?",
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef(null);
    async function sendMessage(e) {
        e.preventDefault();
        if (!input.trim() || loading)
            return;
        const userMsg = { role: "user", content: input.trim() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput("");
        setLoading(true);
        try {
            const res = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: newMessages }),
            });
            if (res.ok) {
                const data = await res.json();
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: data.reply },
                ]);
            }
            else {
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "Sorry, I couldn't respond. Please try again." },
                ]);
            }
        }
        catch (_a) {
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Network error. Please try again." },
            ]);
        }
        finally {
            setLoading(false);
            setTimeout(() => { var _a; return (_a = bottomRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: "smooth" }); }, 50);
        }
    }
    return (<div className="mx-auto flex h-[calc(100vh-80px)] max-w-3xl flex-col px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold">🤖 AI Assistant</h1>
        <p className="text-sm text-white/50 mt-1">
          Ask about songs, artists, how the platform works, or get licensing recommendations.
        </p>
      </div>

      {/* Chat window */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        {messages.map((msg, i) => (<div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user"
                ? "bg-brand-500 text-white rounded-br-sm"
                : "bg-white/10 text-white/90 rounded-bl-sm"}`}>
              {msg.content}
            </div>
          </div>))}
        {loading && (<div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5 text-sm text-white/50">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>)}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="mt-4 flex gap-3">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" className="flex-1 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand-500"/>
        <button type="submit" disabled={!input.trim() || loading} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold hover:bg-brand-600 transition disabled:opacity-50 disabled:cursor-not-allowed">
          Send
        </button>
      </form>

      <p className="mt-3 text-center text-xs text-white/25">
        AI responses are for informational purposes only and do not constitute financial advice.
      </p>
    </div>);
}
