"use client";

import { useState } from "react";

export default function PrivacySettingsClient() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePanelOpen, setDeletePanelOpen] = useState(false);

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/user/export-data", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ems-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleteError(null);
    if (confirmText !== "DELETE") {
      setDeleteError("Type DELETE in capitals to confirm.");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/profile/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText, password: password || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed.");
      window.location.href = "/?deleted=1";
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#141420] p-5">
        <h2 className="text-base font-bold">Download my data</h2>
        <p className="mt-1 text-sm text-white/55">
          Get a JSON copy of your account, content, posts, comments, licenses, conversations, and
          notifications. Rate-limited to once every couple of minutes.
        </p>
        {exportError && (
          <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
            {exportError}
          </p>
        )}
        <button
          type="button"
          onClick={exportData}
          disabled={exporting}
          className="mt-3 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {exporting ? "Preparing…" : "Export my data (JSON)"}
        </button>
      </section>

      <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <h2 className="text-base font-bold text-red-300">Delete my account</h2>
        <p className="mt-1 text-sm text-white/65">
          Permanently deletes your studios, songs, licenses, posts, conversations, and profile.
          Financial records (payouts, Stripe transactions) are kept for accounting where required by
          law and your account is anonymized in those rows. This cannot be undone.
        </p>
        {!deletePanelOpen ? (
          <button
            type="button"
            onClick={() => setDeletePanelOpen(true)}
            className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/15"
          >
            Delete my account…
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-xl border border-red-500/30 bg-black/30 p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">
                Current password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Skip if you signed in via Google"
                className="w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-red-500/50"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">
                Type DELETE to confirm
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-red-500/50"
              />
            </label>
            {deleteError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeletePanelOpen(false);
                  setConfirmText("");
                  setPassword("");
                  setDeleteError(null);
                }}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting || confirmText !== "DELETE"}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
