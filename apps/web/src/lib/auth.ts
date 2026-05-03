import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role, SubscriptionTier } from "@ems/db";
import { emitAuthEvent } from "@/lib/authObservability";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(googleClientId && googleClientSecret);

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
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const normalizedEmail = parsed.data.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user || !user.passwordHash) {
          await emitAuthEvent("signin_invalid_credentials", {
            email: normalizedEmail,
            reason: "user_not_found_or_no_password",
          });
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) {
          await emitAuthEvent("signin_invalid_credentials", {
            email: normalizedEmail,
            userId: user.id,
            reason: "password_mismatch",
          });
          return null;
        }

        // Block unverified credential accounts (OAuth sets emailVerified automatically)
        if (!user.emailVerified) {
          await emitAuthEvent("signin_email_unverified", {
            email: normalizedEmail,
            userId: user.id,
          });
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          subscriptionTier: user.subscriptionTier,
        };
      },
    }),
  ],
  callbacks: {
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
