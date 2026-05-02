import type { Role, SubscriptionTier } from "@ems/db";
import type { DefaultSession, DefaultJWT } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: Role;
      subscriptionTier?: SubscriptionTier;
    };
  }

  interface User {
    id: string;
    role: Role;
    subscriptionTier?: SubscriptionTier;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: Role;
    subscriptionTier?: SubscriptionTier;
  }
}
