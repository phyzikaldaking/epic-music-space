/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { uploadImage, ClientUploadError } from "@/lib/clientImageUpload";

interface ProfileData {
  name: string | null;
  image: string | null;
  email: string;
  role: string;
  studio?: { bio: string | null; username: string } | null;
}

const BIO_MAX = 256;

const PHONE_CHALLENGE_EXPIRES_AT_STORAGE_KEY = "ems_phone_challenge_expires_at";

export default function ProfileEditPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [uploading, setUploading] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");
  const [phoneChallengeCode, setPhoneChallengeCode] = useState("");
  const [phoneChallengeSent, setPhoneChallengeSent] = useState(false);
  const [phoneChallengeVerified, setPhoneChallengeVerified] = useState(false);
  const [phoneManageToken, setPhoneManageToken] = useState("");
  const [phoneChallengeBusy, setPhoneChallengeBusy] = useState(false);
  const [phoneChallengeExpiresAt, setPhoneChallengeExpiresAt] = useState<number | null>(null);
  const [phoneChallengeSecondsLeft, setPhoneChallengeSecondsLeft] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      // Shared `uploadImage` helper: validates by MIME *or* extension
      // (so iPhone HEIC/HEIF and empty-MIME picks from iCloud Drive both
      // work), downscales huge camera shots to 2048px on the long edge,
      // re-encodes to JPEG/PNG to stay under the 10 MB cap, and retries
      // the PUT on transient mobile-network failures.
      const result = await uploadImage(file, { kind: "cover" });
      setImageUrl(result.publicUrl);
    } catch (err) {
      const msg =
        err instanceof ClientUploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Upload failed. Paste a direct image URL below instead.";
      setError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => {
        if (r.status === 401) {
          router.push("/auth/signin?callbackUrl=/profile/edit");
          return null;
        }
        return r.json() as Promise<ProfileData>;
      })
      .then((data) => {
        if (!data) return;
        setName(data.name ?? "");
        setImageUrl(data.image ?? "");
        setBio(data.studio?.bio ?? "");
        setEmail(data.email ?? "");
        setRole(data.role ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load profile.");
        setLoading(false);
      });

    fetch("/api/user/phone")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setPhoneMasked(typeof data.maskedPhone === "string" ? data.maskedPhone : null);
      })
      .catch(() => null);
  }, [router]);

  useEffect(() => {
    const stored = window.localStorage.getItem(PHONE_CHALLENGE_EXPIRES_AT_STORAGE_KEY);
    if (!stored) return;

    const parsed = Number(stored);
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      window.localStorage.removeItem(PHONE_CHALLENGE_EXPIRES_AT_STORAGE_KEY);
      return;
    }

    setPhoneChallengeExpiresAt(parsed);
    setPhoneChallengeSent(true);
  }, []);

  useEffect(() => {
    if (!phoneChallengeExpiresAt) {
      setPhoneChallengeSecondsLeft(0);
      window.localStorage.removeItem(PHONE_CHALLENGE_EXPIRES_AT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      PHONE_CHALLENGE_EXPIRES_AT_STORAGE_KEY,
      String(phoneChallengeExpiresAt),
    );

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((phoneChallengeExpiresAt - Date.now()) / 1000),
      );
      setPhoneChallengeSecondsLeft(remaining);

      if (remaining === 0) {
        setPhoneChallengeVerified(false);
        setPhoneManageToken("");
        window.localStorage.removeItem(PHONE_CHALLENGE_EXPIRES_AT_STORAGE_KEY);
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phoneChallengeExpiresAt]);

  function challengeTimeLabel(totalSeconds: number) {
    const mm = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const ss = (totalSeconds % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  async function handlePhoneSave(e: React.FormEvent) {
    e.preventDefault();
    setPhoneSaving(true);
    setPhoneError("");
    setPhoneSuccess("");

    try {
      const res = await fetch("/api/user/phone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneInput,
          manageToken: phoneManageToken || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        maskedPhone?: string | null;
      };

      if (!res.ok) {
        setPhoneError(data.error ?? "Could not update phone.");
        return;
      }

      setPhoneMasked(data.maskedPhone ?? null);
      setPhoneInput("");
      setPhoneSuccess("Phone number updated.");
      setPhoneChallengeCode("");
      setPhoneChallengeSent(false);
      setPhoneChallengeVerified(false);
      setPhoneManageToken("");
      setPhoneChallengeExpiresAt(null);
    } catch {
      setPhoneError("Could not update phone.");
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleRequestPhoneChallenge() {
    setPhoneChallengeBusy(true);
    setPhoneError("");
    setPhoneSuccess("");

    try {
      const res = await fetch("/api/user/phone/challenge/request", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        expiresInSeconds?: number;
      };
      if (!res.ok) {
        setPhoneError(data.error ?? "Could not send verification code.");
        return;
      }

      const expiresIn = Number(data.expiresInSeconds ?? 600);
      setPhoneChallengeExpiresAt(Date.now() + expiresIn * 1000);
      setPhoneChallengeSent(true);
      setPhoneChallengeVerified(false);
      setPhoneManageToken("");
      setPhoneSuccess("Verification code sent to your current linked phone.");
    } catch {
      setPhoneError("Could not send verification code.");
    } finally {
      setPhoneChallengeBusy(false);
    }
  }

  async function handleVerifyPhoneChallenge() {
    setPhoneChallengeBusy(true);
    setPhoneError("");
    setPhoneSuccess("");

    try {
      const res = await fetch("/api/user/phone/challenge/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: phoneChallengeCode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        manageToken?: string;
        expiresInSeconds?: number;
      };

      if (!res.ok || !data.manageToken) {
        setPhoneError(data.error ?? "Invalid verification code.");
        return;
      }

      setPhoneManageToken(data.manageToken);
      setPhoneChallengeVerified(true);
      const expiresIn = Number(data.expiresInSeconds ?? 600);
      setPhoneChallengeExpiresAt(Date.now() + expiresIn * 1000);
      setPhoneSuccess("Current phone verified. You can now update or remove it.");
    } catch {
      setPhoneError("Could not verify code.");
    } finally {
      setPhoneChallengeBusy(false);
    }
  }

  async function handlePhoneRemove() {
    setPhoneSaving(true);
    setPhoneError("");
    setPhoneSuccess("");

    try {
      const res = await fetch("/api/user/phone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remove: true,
          manageToken: phoneManageToken || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        setPhoneError(data.error ?? "Could not remove phone.");
        return;
      }

      setPhoneMasked(null);
      setPhoneInput("");
      setPhoneSuccess("Phone number removed.");
      setPhoneChallengeCode("");
      setPhoneChallengeSent(false);
      setPhoneChallengeVerified(false);
      setPhoneManageToken("");
      setPhoneChallengeExpiresAt(null);
    } catch {
      setPhoneError("Could not remove phone.");
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    const body: Record<string, string> = {};
    if (name.trim()) body.name = name.trim();
    if (imageUrl.trim()) body.image = imageUrl.trim();
    if (bio.trim().length > 0) body.bio = bio.trim().slice(0, BIO_MAX);

    if (Object.keys(body).length === 0) {
      setError("No changes to save.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Failed to save.");
        setSaving(false);
        return;
      }

      setSuccess(true);
      // Reload session-dependent UI after a short delay
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-sm text-white/40 hover:text-white transition"
      >
        ← Back
      </button>

      <h1 className="mb-1 text-3xl font-extrabold">
        <span className="text-gradient-ems">Edit Profile</span>
      </h1>
      <p className="mb-8 text-sm text-white/40">
        Update your display name and avatar.
      </p>

      {/* Current avatar preview */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/15 bg-brand-500/20 flex items-center justify-center text-2xl flex-shrink-0">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt="Avatar"
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <span>{name?.[0]?.toUpperCase() ?? "?"}</span>
          )}
        </div>
        <div>
          <p className="font-semibold">{name || "(no name)"}</p>
          <p className="text-xs text-white/40">{email}</p>
          <span className="mt-1 inline-block rounded-full bg-brand-500/20 px-2 py-0.5 text-xs text-brand-400">
            {role}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          ✅ Profile updated! Redirecting to dashboard…
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Display name */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Your display name"
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
        </div>

        {/* Avatar upload */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
            Avatar
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
            aria-label="Upload avatar image"
            className="sr-only"
            onChange={handleAvatarFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand-500/50", "bg-brand-500/5"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("border-brand-500/50", "bg-brand-500/5"); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-brand-500/50", "bg-brand-500/5");
              const file = e.dataTransfer.files?.[0];
              if (file) {
                // Trigger the same handler as the file input
                const dt = new DataTransfer();
                dt.items.add(file);
                if (fileInputRef.current) {
                  fileInputRef.current.files = dt.files;
                  fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }
            }}
            disabled={uploading}
            className="mb-2 w-full rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/50 transition hover:border-brand-500/40 disabled:opacity-50"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                Uploading…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-5 w-5 text-white/25" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                {imageUrl ? "Drop to replace, or click to browse" : "Drop avatar here, or click to browse"}
              </span>
            )}
          </button>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/avatar.jpg"
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
          <p className="mt-1 text-xs text-white/25">
            JPG, PNG, WebP, HEIC — max 10 MB. Square recommended.
          </p>
        </div>

        {(role === "ARTIST" || role === "PRODUCER" || role === "ENGINEER" || role === "LABEL") && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
              Bio <span className="normal-case text-white/25">({bio.length}/{BIO_MAX})</span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              rows={3}
              placeholder="Tell the world about your sound…"
              className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40 resize-none"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-brand-500 py-3 font-bold text-white transition hover:bg-brand-600 disabled:opacity-50 glow-purple-sm"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Saving…
            </span>
          ) : (
            "Save Changes"
          )}
        </button>
      </form>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/70">
          Phone sign-in
        </h2>
        <p className="mt-2 text-xs text-white/50">
          Link a phone number to sign in with one-time login codes.
        </p>
        <p className="mt-2 text-xs text-white/60">
          Current: {phoneMasked ?? "Not linked"}
        </p>

        {phoneMasked && (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-white/60">
              For security, verify your current linked phone before replacing or removing it.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleRequestPhoneChallenge}
                disabled={phoneChallengeBusy}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                {phoneChallengeSent ? "Resend code" : "Send verification code"}
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={phoneChallengeCode}
                onChange={(e) =>
                  setPhoneChallengeCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="6-digit code"
                className="flex-1 rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-xs text-white placeholder-white/35 outline-none focus:border-brand-500/50"
              />
              <button
                type="button"
                onClick={handleVerifyPhoneChallenge}
                disabled={phoneChallengeBusy || phoneChallengeCode.length !== 6}
                className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                Verify
              </button>
            </div>
            <p className="mt-2 text-[11px] text-white/45">
              {phoneChallengeVerified
                ? "Verified. You can update or remove this phone now."
                : "Verification expires in about 10 minutes."}
            </p>
            {phoneChallengeSent && phoneChallengeSecondsLeft > 0 && (
              <p className="mt-1 text-[11px] text-white/55">
                Challenge expires in {challengeTimeLabel(phoneChallengeSecondsLeft)}
              </p>
            )}
            {phoneChallengeSent && phoneChallengeSecondsLeft === 0 && (
              <p className="mt-1 text-[11px] text-red-300">
                Challenge expired. Request and verify a new code.
              </p>
            )}
          </div>
        )}

        {phoneError && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {phoneError}
          </div>
        )}

        {phoneSuccess && (
          <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300">
            {phoneSuccess}
          </div>
        )}

        <form onSubmit={handlePhoneSave} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="+15551234567"
            className="flex-1 rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-brand-500/50"
          />
          <button
            type="submit"
            disabled={
              phoneSaving ||
              !phoneInput.trim() ||
              (phoneMasked !== null && !phoneChallengeVerified)
            }
            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {phoneSaving ? "Saving…" : "Save phone"}
          </button>
        </form>

        {phoneMasked && (
          <button
            type="button"
            onClick={handlePhoneRemove}
            disabled={phoneSaving || !phoneChallengeVerified}
            className="mt-3 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/75 hover:bg-white/10 disabled:opacity-50"
          >
            Remove linked phone
          </button>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-white/20">
        Email and role cannot be changed here. Contact support for account changes.
      </p>

      <DeleteAccountSection />
    </div>
  );
}

function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    if (confirm !== "DELETE") {
      setErr("Type DELETE to confirm.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/profile/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm, password: pw || undefined }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; mode?: string };
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "Couldn't delete the account.");
      return;
    }
    // Hard nav to the home page; session cookie is dead now.
    window.location.href = "/?deleted=1";
  }

  return (
    <div className="mt-12 border-t border-white/10 pt-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-red-300/70">
        Danger zone
      </h2>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/15"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
          <p className="text-sm text-white/70">
            This permanently deletes your studios, songs, licenses, room history,
            and profile. Financial records (payouts, transactions) are kept for
            accounting where required by law and your account is anonymized.
          </p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Current password (skip if you signed in via Google)"
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-red-500/50"
          />
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-red-500/50"
          />
          {err && <p className="text-xs text-red-300">{err}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setErr(null); setConfirm(""); setPw(""); }}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy || confirm !== "DELETE"}
              className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
