-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'STARTER', 'PRO', 'PRIME', 'LABEL_TIER');

-- AlterTable: add subscriptionTier and stripeCustomerId to User
ALTER TABLE "User"
  ADD COLUMN "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
