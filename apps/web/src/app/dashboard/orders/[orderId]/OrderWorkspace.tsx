"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

type Person = { id: string; name: string | null; image: string | null; username?: string | null };
type Message = {
  id: string;
  fromUserId: string;
  name: string | null;
  image: string | null;
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
};
type Revision = {
  id: string;
  revisionNumber: number;
  deliverableUrl: string;
  message: string | null;
  deliveredAt: string;
};
type Order = {
  id: string;
  status: string;
  priceUsd: string;
  briefText: string | null;
  briefUrl: string | null;
  deliverableUrl: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  acceptDeadline: string | null;
  revisionsUsed: number;
  listing: { id: string; title: string; kindLabel: string; isInstant: boolean; deliveryDays: number };
  buyer: Person;
  provider: Person;
  messages: Message[];
  revisions: Revision[];
  review: { rating: number; body: string | null } | null;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING:             { label: "Pending payment",   cls: "border-white/15 bg-white/5 text-white/55" },
  PAID:                { label: "Awaiting work",     cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  IN_PROGRESS:         { label: "In progress",       cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  DELIVERED:           { label: "Delivered — review",cls: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" },
  REVISION_REQUESTED:  { label: "Revision requested",cls: "border-orange-400/40 bg-orange-400/10 text-orange-300" },
  COMPLETED:           { label: "Completed",         cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" },
  REFUNDED:            { label: "Refunded",          cls: "border-red-400/40 bg-red-400/10 text-red-300" },
  CANCELLED:           { label: "Cancelled",         cls: "border-red-400/40 bg-red-400/10 text-red-300" },
};

export default function OrderWorkspace({
  order: initialOrder,
  currentUserId,
  isProvider,
}: {
  order: Order;
  currentUserId: string;
  isProvider: boolean;
}) {
  const router = useRouter();
  const [order] = useState(initialOrder);
  const [messages, setMessages] = useState(initialOrder.messages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "deliver" | "accept" | "revise" | "review">("");
  const [err, setErr] = useState<string | null>(null);

  // Provider deliver fields
  const [deliverUrl, setDeliverUrl] = useState("");
  const [deliverNote, setDeliverNote] = useState("");
  const [deliverOpen, setDeliverOpen] = useState(false);

  // Buyer revision fields
  const [revisionMsg, setRevisionMsg] = useState("");
  const [reviseOpen, setReviseOpen] = useState(false);

  // Buyer review fields
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);

  const status = STATUS_BADGE[order.status] ?? { label: order.status, cls: "" };
  const counterpart = isProvider ? order.buyer : order.provider;

  async function send(action: string, payload: Record<string, unknown>, key: typeof busy) {
    setBusy(key);
    setErr(null);
    const res = await fetch(`/api/services/orders/${order.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: Message };
    setBusy("");
    if (!res.ok) {
      setErr(data.error ?? "Something went wrong.");
      return null;
    }
    return data;
  }

  async function postMessage() {
    if (!draft.trim()) return;
    const data = await send("messages", { body: draft.trim() }, "send");
    if (data?.message) {
      setMessages((m) => [...m, data.message!]);
      setDraft("");
    }
  }

  async function deliver() {
    if (!deliverUrl.trim()) {
      setErr("Paste a downloadable URL (Dropbox, S3, Drive, etc).");
      return;
    }
    const ok = await send("deliver", { deliverableUrl: deliverUrl.trim(), message: deliverNote.trim() || undefined }, "deliver");
    if (ok) {
      setDeliverOpen(false);
      setDeliverUrl("");
      setDeliverNote("");
      router.refresh();
    }
  }

  async function accept() {
    if (!confirm("Approve this order? Payout will be released in the next weekly cycle.")) return;
    const ok = await send("accept", {}, "accept");
    if (ok) router.refresh();
  }

  async function requestRevision() {
    if (revisionMsg.trim().length < 5) {
      setErr("Tell the engineer what to change (5+ chars).");
      return;
    }
    const ok = await send("request-revision", { message: revisionMsg.trim() }, "revise");
    if (ok) {
      setReviseOpen(false);
      setRevisionMsg("");
      router.refresh();
    }
  }

  async function leaveReview() {
    const ok = await send("review", { rating: reviewRating, body: reviewBody.trim() || undefined }, "review");
    if (ok) {
      setReviewOpen(false);
      router.refresh();
    }
  }

  const canDeliver = isProvider && (order.status === "PAID" || order.status === "IN_PROGRESS" || order.status === "REVISION_REQUESTED");
  const canAccept = !isProvider && order.status === "DELIVERED";
  const canRevise = !isProvider && order.status === "DELIVERED" && order.revisionsUsed < 3;
  const canReview = !isProvider && order.status === "COMPLETED" && !order.review;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Link href={isProvider ? "/dashboard/services" : "/dashboard/orders"} className="text-xs text-white/45 hover:text-white">
        ← Back
      </Link>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">
            {order.listing.kindLabel} · ${Number(order.priceUsd).toFixed(2)}
          </p>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{order.listing.title}</h1>
          <p className="mt-1 text-xs text-white/45">
            {isProvider ? "Buyer:" : "Engineer:"} {counterpart.name ?? counterpart.username ?? "—"}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${status.cls}`}>
          {status.label}
        </span>
      </div>

      {err && (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {err}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Left: brief + revisions + actions */}
        <div className="space-y-5">
          {/* Brief */}
          <section className="rounded-3xl border border-white/8 bg-[#0d0d14] p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/45">Brief</h2>
            {order.briefText ? (
              <p className="mt-2 whitespace-pre-line text-sm text-white/80">{order.briefText}</p>
            ) : (
              <p className="mt-2 text-sm text-white/40 italic">No notes — see chat for details.</p>
            )}
            {order.briefUrl && (
              <a
                href={order.briefUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10"
              >
                📦 Download stems / files
              </a>
            )}
          </section>

          {/* Revisions */}
          {order.revisions.length > 0 && (
            <section className="rounded-3xl border border-white/8 bg-[#0d0d14] p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/45">Deliveries ({order.revisions.length})</h2>
              <div className="space-y-3">
                {order.revisions.map((r) => (
                  <div key={r.id} className="rounded-xl border border-white/8 bg-white/3 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">v{r.revisionNumber}</p>
                      <p className="text-xs text-white/40">{new Date(r.deliveredAt).toLocaleDateString()}</p>
                    </div>
                    {r.message && <p className="mt-1 text-xs text-white/60">{r.message}</p>}
                    <a
                      href={r.deliverableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
                    >
                      Open delivery →
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Buyer actions */}
          {canAccept && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={accept}
                disabled={!!busy}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {busy === "accept" ? "Approving..." : "✓ Approve & release funds"}
              </button>
              {canRevise && !reviseOpen && (
                <button
                  type="button"
                  onClick={() => setReviseOpen(true)}
                  className="w-full rounded-2xl border border-orange-400/30 bg-orange-400/5 px-4 py-3 text-sm font-semibold text-orange-300 hover:bg-orange-400/10"
                >
                  🔁 Request revision ({3 - order.revisionsUsed} of 3 left)
                </button>
              )}
              {reviseOpen && (
                <div className="space-y-2 rounded-2xl border border-orange-400/30 bg-orange-400/5 p-4">
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={revisionMsg}
                    onChange={(e) => setRevisionMsg(e.target.value)}
                    placeholder="What needs to change? (vocals louder, more low end, etc.)"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-400/50"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setReviseOpen(false); setErr(null); }}
                      className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/65"
                    >Cancel</button>
                    <button
                      type="button"
                      onClick={requestRevision}
                      disabled={!!busy}
                      className="flex-1 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >{busy === "revise" ? "..." : "Send revision"}</button>
                  </div>
                </div>
              )}
              {!canRevise && order.revisionsUsed >= 3 && (
                <p className="text-center text-xs text-white/35">
                  Free revisions used. Negotiate further changes via chat.
                </p>
              )}
              <p className="text-center text-[11px] text-white/30">
                {order.acceptDeadline
                  ? `Auto-approves on ${new Date(order.acceptDeadline).toLocaleDateString()} if no action.`
                  : ""}
              </p>
            </section>
          )}

          {/* Provider deliver */}
          {canDeliver && (
            <section>
              {!deliverOpen ? (
                <button
                  type="button"
                  onClick={() => setDeliverOpen(true)}
                  className="w-full rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600"
                >
                  {order.status === "REVISION_REQUESTED" ? "Deliver revision" : "Deliver"} →
                </button>
              ) : (
                <div className="space-y-2 rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4">
                  <input
                    type="url"
                    value={deliverUrl}
                    onChange={(e) => setDeliverUrl(e.target.value)}
                    placeholder="Final URL (Dropbox, S3, Drive, etc)"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-500/50"
                  />
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={deliverNote}
                    onChange={(e) => setDeliverNote(e.target.value)}
                    placeholder="Note to buyer (optional)"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-500/50"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setDeliverOpen(false); setErr(null); }}
                      className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/65"
                    >Cancel</button>
                    <button
                      type="button"
                      onClick={deliver}
                      disabled={!!busy}
                      className="flex-1 rounded-xl bg-brand-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >{busy === "deliver" ? "Delivering..." : "Deliver"}</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Buyer review */}
          {canReview && (
            <section>
              {!reviewOpen ? (
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/10"
                >
                  ⭐ Leave a review
                </button>
              ) : (
                <div className="space-y-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setReviewRating(n)}
                        className={`text-2xl ${n <= reviewRating ? "text-amber-300" : "text-white/20"}`}
                      >★</button>
                    ))}
                  </div>
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value)}
                    placeholder="What did you think? Optional but helps other buyers."
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewOpen(false)}
                      className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/65"
                    >Cancel</button>
                    <button
                      type="button"
                      onClick={leaveReview}
                      disabled={!!busy}
                      className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >{busy === "review" ? "..." : "Submit"}</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {order.review && (
            <section className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Your review</p>
              <p className="mt-1 text-amber-200">{"★".repeat(order.review.rating)}{"☆".repeat(5 - order.review.rating)}</p>
              {order.review.body && <p className="mt-1 text-sm text-white/70">{order.review.body}</p>}
            </section>
          )}
        </div>

        {/* Right: chat */}
        <aside className="flex h-[600px] flex-col rounded-3xl border border-white/8 bg-[#0d0d14]">
          <div className="border-b border-white/8 px-5 py-3">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Order chat</h3>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <p className="text-center text-xs text-white/30">No messages yet — start the conversation.</p>
            )}
            {messages.map((m) => {
              const mine = m.fromUserId === currentUserId;
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-white/10">
                    {m.image ? (
                      <Image src={m.image} alt={m.name ?? ""} fill sizes="28px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">
                        {(m.name ?? "?")[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className={`min-w-0 max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-brand-500/20 text-white" : "bg-white/5 text-white/85"}`}>
                    <p className="text-[11px] text-white/50">{m.name ?? "Guest"}</p>
                    <p className="mt-0.5 whitespace-pre-line break-words">{m.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); void postMessage(); }}
            className="flex gap-2 border-t border-white/8 p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              maxLength={4000}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-500/50"
            />
            <button
              type="submit"
              disabled={!!busy || !draft.trim()}
              className="rounded-xl bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
