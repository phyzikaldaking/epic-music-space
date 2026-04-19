"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "LISTENER" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    // Auto sign in after register
    await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-3xl p-8">
          <h1 className="mb-2 text-2xl font-extrabold">Create account</h1>
          <p className="mb-8 text-sm text-white/50">
            Join Epic Music Space — it&apos;s free
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">
                Name
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">
                Email
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">
                I am a…
              </label>
              <select
                value={form.role}
                onChange={(e) => update("role", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0a0a0f] px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="LISTENER">Fan / Listener (license music)</option>
                <option value="ARTIST">Artist (upload &amp; earn)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/40">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-brand-400 hover:underline">
              Sign in
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-white/25">
            By creating an account you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-white/50">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-white/50">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
