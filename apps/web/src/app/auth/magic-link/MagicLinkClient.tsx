"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizeCallbackPath } from "@/lib/safeCallback";

type Status = "verifying" | "error";

export default function MagicLinkClient() {
  const router = useRouter();
  const params = useSearchParams();
  const ranRef = useRef(false);
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const callbackUrl = sanitizeCallbackPath(params.get("callbackUrl"));

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!email || !token) {
      setStatus("error");
      setErrorMessage("This sign-in link is missing required information. Request a fresh link below.");
      return;
    }

    (async () => {
      const result = await signIn("email-link", {
        email,
        token,
        redirect: false,
      });

      if (!result || result.error) {
        let urlCode: string | null = null;
        try {
          if (result?.url && typeof window !== "undefined") {
            urlCode = new URL(result.url, window.location.origin).searchParams.get("code");
          }
        } catch {
          /* ignore */
        }
        const code = (
          ("code" in (result ?? {}) ? (result as { code?: unknown }).code : undefined) ??
          urlCode ??
          result?.error ??
          ""
        )
          .toString()
          .toLowerCase();

        setStatus("error");
        if (code.includes("rate_limited")) {
          setErrorMessage("Too many sign-in attempts. Wait a minute, then request a fresh link.");
        } else if (code.includes("account_suspended")) {
          setErrorMessage("This account is restricted. Contact support for help.");
        } else {
          setErrorMessage("This sign-in link is invalid or has expired. Request a fresh one below.");
        }
        return;
      }

      router.refresh();
      router.push(callbackUrl);
    })();
  }, [email, token, callbackUrl, router]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center">
        {status === "verifying" ? (
          <>
            <h1 className="mb-2 text-2xl font-extrabold">Signing you in…</h1>
            <p className="text-sm text-white/50">Hold tight — this only takes a moment.</p>
            <div className="mx-auto mt-6 h-1 w-32 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-pulse bg-brand-500" />
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-2xl font-extrabold">Couldn&apos;t sign you in</h1>
            <p className="mb-6 text-sm text-white/60">{errorMessage}</p>
            <Link
              href={`/auth/signin${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="inline-block rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600 transition"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
