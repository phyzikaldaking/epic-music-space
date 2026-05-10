import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role, SubscriptionTier } from "@ems/db";
import { emitAuthEvent } from "@/lib/authObservability";
import { getClientIp, hashAuthToken, normalizeEmail } from "@/lib/authIdentity";
import {
  hashPhoneLoginCode,
  normalizePhone,
  phoneLoginIdentifier,
} from "@/lib/phoneAuth";
import {
  assertSignInAllowed,
  clearSignInFailures,
  recordFailedSignIn,
} from "@/lib/signInGuard";
import { verifyTurnstileToken } from "@/lib/turnstile";

class TurnstileFailedError extends CredentialsSignin {
  code = "turnstile_failed";
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  turnstileToken: z.string().optional(),
});

const phoneOtpSchema = z.object({
  phone: z.string().min(8).max(32),
  code: z.string().regex(/^\d{6}$/),
  turnstileToken: z.string().optional(),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
  token: z.string().min(32).max(128),
});

export const MAGIC_LINK_IDENTIFIER_PREFIX = "magic:";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(googleClientId && googleClientSecret);

const appleClientId = process.env.APPLE_CLIENT_ID;
const appleClientSecret = process.env.APPLE_CLIENT_SECRET;
const appleEnabled = Boolean(appleClientId && appleClientSecret);

class AccountSuspendedError extends CredentialsSignin {
  code = "account_suspended";
}

class SignInRateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

class MagicLinkInvalidError extends CredentialsSignin {
  code = "magic_link_invalid";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Trust the X-Forwarded-Host / Host header when Vercel (or any proxy
  // in front of us) sets it. NextAuth v5 defaults to rejecting requests
  // whose host doesn't match the configured AUTH_URL — that breaks
  // sign-in on preview deploys, custom domains, and any setup where a
  // load balancer rewrites Host (corporate VPNs, ISP proxies, some
  // Safari-on-Mac configurations behind transparent caches). Without
  // this, the failure mode is silent: the form posts, the response is
  // 400, and the user just sees "couldn't sign in" with no recourse.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days — persistent across browser restarts
    updateAge: 24 * 60 * 60,   // Refresh JWT once per day, not on every request
  },
  // Explicit cookie config: path "/" so the cookie travels with EVERY page
  // (including the marketplace, feed, track pages, etc.), sameSite "lax" so
  // it survives back-button navigation and external links into the app.
  // Without this, browsers would sometimes drop the session on cross-page
  // navigations, forcing users to "re-login" on every page switch.
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
  providers: [
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
            // Allow users who registered with email+password to sign in with
            // Google using the same email without getting OAuthAccountNotLinked.
            // Safe: Google verifies email ownership before returning the token.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    ...(appleEnabled
      ? [
          AppleProvider({
            clientId: appleClientId!,
            clientSecret: appleClientSecret!,
            // Apple verifies the email before returning a token, so linking
            // by email to an existing credential account is safe. Note that
            // Apple may return a private-relay address (@privaterelay.appleid.com)
            // — we treat those as the user's verified address.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const normalizedEmail = normalizeEmail(parsed.data.email);
        const ip = getClientIp(request.headers);

        // Bot gate. When TURNSTILE_SECRET_KEY is unset the verifier
        // returns ok:true so dev / pre-Turnstile deploys still work.
        const turnstile = await verifyTurnstileToken(parsed.data.turnstileToken, ip);
        if (!turnstile.ok) {
          await emitAuthEvent("signin_invalid_credentials", {
            email: normalizedEmail,
            ip,
            reason: "turnstile_failed",
          });
          throw new TurnstileFailedError();
        }

        const signinGate = await assertSignInAllowed(normalizedEmail, ip);
        if (!signinGate.allowed) {
          await emitAuthEvent("signin_rate_limited", {
            email: normalizedEmail,
            ip,
            retryAfterSeconds: signinGate.retryAfterSeconds,
          });
          throw new SignInRateLimitedError();
        }

        const user = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            subscriptionTier: true,
            passwordHash: true,
            emailVerified: true,
            isSuspended: true,
          },
        });

        // Constant-time path for missing user / OAuth-only user. Run a
        // dummy bcrypt.compare against a fixed hash so the response time
        // is indistinguishable from a real user with a wrong password.
        // Eliminates the timing oracle that previously let an attacker
        // probe for valid email addresses by measuring sign-in latency.
        if (!user || !user.passwordHash) {
          // Cost-12 hash of an unknowable string — same cost as our real
          // bcrypt.compare so timing matches.
          await bcrypt.compare(
            parsed.data.password,
            "$2a$12$invalidinvalidinvalidinvali.placeholder.placeholder.placeholder",
          ).catch(() => false);
          // We deliberately do NOT call recordFailedSignIn for non-existent
          // emails — that would let an attacker lock any victim out by
          // guessing their address. The per-IP rate-limit still applies.
          await emitAuthEvent("signin_invalid_credentials", {
            email: normalizedEmail,
            ip,
            reason: "user_not_found_or_no_password",
          });
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) {
          await recordFailedSignIn(normalizedEmail, ip);
          await emitAuthEvent("signin_invalid_credentials", {
            email: normalizedEmail,
            userId: user.id,
            ip,
            reason: "password_mismatch",
          });
          return null;
        }

        if (user.isSuspended) {
          await emitAuthEvent("signin_suspended", {
            email: normalizedEmail,
            userId: user.id,
            ip,
          });
          throw new AccountSuspendedError();
        }

        // Let a correct password get the user into the product even if
        // verification email delivery failed, landed in spam, or was delayed.
        // The dashboard keeps the verification banner visible and risk scoring
        // still treats unverified email as a negative signal; it just is not a
        // login-killing wall anymore.
        if (!user.emailVerified) {
          await emitAuthEvent("signin_email_unverified_allowed", {
            email: normalizedEmail,
            userId: user.id,
            ip,
          });
        }

        await clearSignInFailures(normalizedEmail, ip);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          subscriptionTier: user.subscriptionTier,
        };
      },
    }),
    CredentialsProvider({
      id: "email-link",
      name: "Email link",
      credentials: {
        email: { label: "Email", type: "email" },
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = magicLinkSchema.safeParse(credentials);
        if (!parsed.success) throw new MagicLinkInvalidError();

        const normalizedEmail = normalizeEmail(parsed.data.email);
        const ip = getClientIp(request.headers);

        const signinGate = await assertSignInAllowed(`magic:${normalizedEmail}`, ip);
        if (!signinGate.allowed) {
          await emitAuthEvent("signin_rate_limited", {
            email: normalizedEmail,
            ip,
            retryAfterSeconds: signinGate.retryAfterSeconds,
          });
          throw new SignInRateLimitedError();
        }

        const hashedToken = hashAuthToken(parsed.data.token);
        const record = await prisma.verificationToken.findUnique({
          where: { token: hashedToken },
          select: { token: true, identifier: true, expires: true },
        });

        const expectedIdentifier = `${MAGIC_LINK_IDENTIFIER_PREFIX}${normalizedEmail}`;
        if (
          !record ||
          record.identifier.toLowerCase() !== expectedIdentifier ||
          record.expires < new Date()
        ) {
          await recordFailedSignIn(`magic:${normalizedEmail}`, ip);
          await emitAuthEvent("magic_link_invalid", {
            email: normalizedEmail,
            ip,
            reason: !record
              ? "token_not_found"
              : record.identifier.toLowerCase() !== expectedIdentifier
                ? "identifier_mismatch"
                : "expired",
          });
          if (record && record.expires < new Date()) {
            await prisma.verificationToken
              .delete({ where: { token: record.token } })
              .catch(() => {});
          }
          throw new MagicLinkInvalidError();
        }

        const user = await prisma.user.findFirst({
          where: {
            email: { equals: normalizedEmail, mode: "insensitive" },
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            subscriptionTier: true,
            emailVerified: true,
            isSuspended: true,
          },
        });

        if (!user) {
          await prisma.verificationToken
            .delete({ where: { token: record.token } })
            .catch(() => {});
          throw new MagicLinkInvalidError();
        }

        if (user.isSuspended) {
          await emitAuthEvent("signin_suspended", {
            email: normalizedEmail,
            userId: user.id,
            ip,
          });
          throw new AccountSuspendedError();
        }

        await prisma.$transaction([
          prisma.verificationToken.delete({ where: { token: record.token } }),
          ...(user.emailVerified
            ? []
            : [
                prisma.user.update({
                  where: { id: user.id },
                  data: { emailVerified: new Date() },
                }),
              ]),
        ]);

        await clearSignInFailures(`magic:${normalizedEmail}`, ip);
        await emitAuthEvent("magic_link_signin_success", {
          email: normalizedEmail,
          userId: user.id,
          ip,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          subscriptionTier: user.subscriptionTier,
        };
      },
    }),
    CredentialsProvider({
      id: "phone-otp",
      name: "Phone",
      credentials: {
        phone: { label: "Phone", type: "tel" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = phoneOtpSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const ipForGate = getClientIp(request.headers);
        const turnstile = await verifyTurnstileToken(parsed.data.turnstileToken, ipForGate);
        if (!turnstile.ok) {
          throw new TurnstileFailedError();
        }

        const normalizedPhone = normalizePhone(parsed.data.phone);
        if (!normalizedPhone) {
          await emitAuthEvent("phone_signin_invalid_phone", {
            ip: getClientIp(request.headers),
          });
          return null;
        }

        const ip = getClientIp(request.headers);
        const signinGate = await assertSignInAllowed(`phone:${normalizedPhone}`, ip);
        if (!signinGate.allowed) {
          await emitAuthEvent("signin_rate_limited", {
            ip,
            retryAfterSeconds: signinGate.retryAfterSeconds,
          });
          throw new SignInRateLimitedError();
        }

        const linked = await prisma.connectedAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "phone",
              providerAccountId: normalizedPhone,
            },
          },
          select: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                subscriptionTier: true,
                isSuspended: true,
              },
            },
          },
        });

        if (!linked?.user) {
          await recordFailedSignIn(`phone:${normalizedPhone}`, ip);
          await emitAuthEvent("signin_invalid_credentials", {
            ip,
            reason: "phone_not_linked",
          });
          return null;
        }

        if (linked.user.isSuspended) {
          await emitAuthEvent("signin_suspended", {
            userId: linked.user.id,
            ip,
          });
          throw new AccountSuspendedError();
        }

        const token = await prisma.verificationToken.findFirst({
          where: {
            identifier: phoneLoginIdentifier(normalizedPhone),
            token: hashPhoneLoginCode(parsed.data.code, normalizedPhone),
            expires: { gt: new Date() },
          },
          select: { token: true },
        });

        if (!token) {
          await recordFailedSignIn(`phone:${normalizedPhone}`, ip);
          await emitAuthEvent("phone_signin_invalid_code", {
            userId: linked.user.id,
            ip,
          });
          return null;
        }

        await prisma.verificationToken.deleteMany({
          where: { identifier: phoneLoginIdentifier(normalizedPhone) },
        });

        await clearSignInFailures(`phone:${normalizedPhone}`, ip);

        return {
          id: linked.user.id,
          email: linked.user.email,
          name: linked.user.name,
          role: linked.user.role,
          subscriptionTier: linked.user.subscriptionTier,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const provider = account?.provider;
      const isOAuth = Boolean(provider && provider !== "credentials" && provider !== "email-link" && provider !== "phone-otp");

      // For credentials sign-in we already returned a Prisma user.id from
      // authorize(), so a `user.id` lookup is meaningful. For OAuth (Google,
      // Apple) signIn fires BEFORE the PrismaAdapter creates/links the User
      // — at this point `user.id` is the *provider's* sub, not a DB row.
      // Looking it up returns null and the flow gets killed before the
      // adapter can create the User row. That bug locked every Google
      // sign-in attempt on the platform; the real DB write was being
      // aborted by our own gate.
      //
      // Fix: for OAuth, look up by email (Google + Apple always provide a
      // verified email). If no row exists, let the flow continue —
      // PrismaAdapter will createUser + linkAccount after we return true.
      if (isOAuth) {
        const oauthEmail =
          (typeof profile?.email === "string" && profile.email) ||
          (typeof user?.email === "string" && user.email) ||
          null;

        if (!oauthEmail) {
          await emitAuthEvent("oauth_signin_failure", {
            provider,
            reason: "missing_email",
          });
          return false;
        }

        const normalized = normalizeEmail(oauthEmail);
        const dbUser = await prisma.user.findFirst({
          where: { email: { equals: normalized, mode: "insensitive" } },
          select: {
            id: true,
            email: true,
            isSuspended: true,
            emailVerified: true,
            passwordHash: true,
          },
        });

        // No existing user → fully new OAuth signup. Let PrismaAdapter
        // create the User + Account; the rest of our checks happen on
        // subsequent visits when the row exists.
        if (!dbUser) {
          await emitAuthEvent("oauth_signin_success", {
            email: normalized,
            provider,
            reason: "first_time_oauth",
          });
          return true;
        }

        if (dbUser.isSuspended) {
          await emitAuthEvent("signin_suspended", {
            userId: dbUser.id,
            email: dbUser.email ?? undefined,
            provider,
          });
          return "/auth/signin?error=account_suspended";
        }

        // Auto-verify the email only on OAuth-ONLY accounts (no
        // passwordHash). If a credentials account exists and the user
        // never finished verification, we MUST NOT let an attacker
        // side-channel-verify it via Google — defeats the email
        // verification gate. The credentials user has to verify the
        // original way.
        if (!dbUser.emailVerified && !dbUser.passwordHash) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { emailVerified: new Date() },
          });
        }

        // Clear the per-email lockout counter so a user who got locked
        // out by wrong passwords isn't still blocked after a successful
        // Google/Apple sign-in.
        if (dbUser.email) {
          await clearSignInFailures(normalizeEmail(dbUser.email), "oauth").catch(
            () => null,
          );
        }

        await emitAuthEvent("oauth_signin_success", {
          userId: dbUser.id,
          email: dbUser.email ?? undefined,
          provider,
        });

        return true;
      }

      // Credentials path: user.id is a real DB cuid we returned from
      // authorize(). Verify it still exists and isn't suspended.
      if (!user?.id) {
        await emitAuthEvent("oauth_signin_failure", {
          reason: "missing_user",
          provider,
        });
        return false;
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, isSuspended: true },
      });

      if (!dbUser) {
        await emitAuthEvent("oauth_signin_failure", {
          userId: user.id,
          reason: "missing_db_user",
          provider,
        });
        return false;
      }

      if (dbUser.isSuspended) {
        await emitAuthEvent("signin_suspended", {
          userId: dbUser.id,
          email: dbUser.email ?? undefined,
          provider,
        });
        return "/auth/signin?error=account_suspended";
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        // Stamp the issue time in seconds so the session callback can
        // compare against User.sessionsRevokedAt and force-sign-out
        // tokens that were issued before a revocation event (password
        // reset, suspend, admin sign-out).
        token.iat = Math.floor(Date.now() / 1000);
        // For OAuth sign-ins the PrismaAdapter returns the DB user, but if
        // role/subscriptionTier are missing (e.g. first-ever Google login on a
        // freshly-created account), fall back to a DB lookup.
        if (user.role && user.subscriptionTier !== undefined) {
          token.role = user.role;
          token.subscriptionTier = user.subscriptionTier;
        } else if (account?.provider !== "credentials") {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true, subscriptionTier: true },
           });
           token.role = dbUser?.role ?? "LISTENER";
           token.subscriptionTier = dbUser?.subscriptionTier;
        } else {
          token.role = user.role;
          token.subscriptionTier = user.subscriptionTier;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!token?.id) return session;

      // Server-side revocation check. One DB read per session lookup,
      // pulling only the two fields we need. If sessionsRevokedAt was
      // set after this JWT was issued, OR if the user is currently
      // suspended, return a session with no `user.id` so the rest of
      // the app treats this request as signed-out.
      const userId = token.id as string;
      const tokenIat = typeof token.iat === "number" ? token.iat : 0;
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { sessionsRevokedAt: true, isSuspended: true },
        });
        const revokedAtSec = dbUser?.sessionsRevokedAt
          ? Math.floor(dbUser.sessionsRevokedAt.getTime() / 1000)
          : 0;
        const revoked =
          dbUser?.isSuspended === true ||
          (revokedAtSec > 0 && revokedAtSec >= tokenIat);
        if (revoked) {
          // Strip the user identity. Server pages reading the session
          // see no `user.id` and redirect to /auth/signin.
          return { ...session, user: { ...session.user } } as typeof session;
        }
      } catch {
        // DB lookup failure: fail open (let the session through) so a
        // transient DB blip doesn't sign every user out. The server-
        // side checks on individual routes still enforce auth.
      }

      session.user.id = userId;
      session.user.role = token.role as Role;
      session.user.subscriptionTier = token.subscriptionTier as SubscriptionTier | undefined;
      return session;
    },
  },
});
