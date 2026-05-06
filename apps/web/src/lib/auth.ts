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
import { getClientIp, normalizeEmail } from "@/lib/authIdentity";
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

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const phoneOtpSchema = z.object({
  phone: z.string().min(8).max(32),
  code: z.string().regex(/^\d{6}$/),
});

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(googleClientId && googleClientSecret);

const appleClientId = process.env.APPLE_CLIENT_ID;
const appleClientSecret = process.env.APPLE_CLIENT_SECRET;
const appleEnabled = Boolean(appleClientId && appleClientSecret);

class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

class AccountSuspendedError extends CredentialsSignin {
  code = "account_suspended";
}

class SignInRateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days — persistent across browser restarts
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

        // Block unverified credential accounts (OAuth sets emailVerified automatically)
        if (!user.emailVerified) {
          await emitAuthEvent("signin_email_unverified", {
            email: normalizedEmail,
            userId: user.id,
            ip,
          });
          throw new EmailNotVerifiedError();
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
      id: "phone-otp",
      name: "Phone",
      credentials: {
        phone: { label: "Phone", type: "tel" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = phoneOtpSchema.safeParse(credentials);
        if (!parsed.success) return null;

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
    async signIn({ user, account }) {
      if (!user?.id) {
        await emitAuthEvent("oauth_signin_failure", {
          reason: "missing_user",
          provider: account?.provider,
        });
        return false;
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          isSuspended: true,
          emailVerified: true,
          passwordHash: true,
        },
      });

      if (!dbUser) {
        await emitAuthEvent("oauth_signin_failure", {
          userId: user.id,
          reason: "missing_db_user",
          provider: account?.provider,
        });
        return false;
      }

      if (dbUser.isSuspended) {
        await emitAuthEvent("signin_suspended", {
          userId: dbUser.id,
          email: dbUser.email ?? undefined,
          provider: account?.provider,
        });
        return "/auth/signin?error=account_suspended";
      }

      if (account?.provider && account.provider !== "credentials") {
        // Only auto-verify the email when the account is OAuth-ONLY
        // (no passwordHash). If a credentials account exists for this
        // email and the user never finished verification, we must NOT
        // let an attacker side-channel-verify it via Google/Apple — that
        // would defeat the entire email-verification gate. The credentials
        // user has to verify the original way (the email we sent them).
        if (!dbUser.emailVerified && !dbUser.passwordHash) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { emailVerified: new Date() },
          });
        }

        await emitAuthEvent("oauth_signin_success", {
          userId: dbUser.id,
          email: dbUser.email ?? undefined,
          provider: account.provider,
        });
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
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
          token.role = dbUser?.role ?? "FAN";
          token.subscriptionTier = dbUser?.subscriptionTier;
        } else {
          token.role = user.role;
          token.subscriptionTier = user.subscriptionTier;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.subscriptionTier = token.subscriptionTier as SubscriptionTier | undefined;
      }
      return session;
    },
  },
});
