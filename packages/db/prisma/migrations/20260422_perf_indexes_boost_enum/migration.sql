-- Add BOOST_PURCHASE to TransactionType enum
ALTER TYPE "TransactionType" ADD VALUE 'BOOST_PURCHASE';

-- Index 1: Song.artistId (FK lookup — artist's catalog)
CREATE INDEX "Song_artistId_idx" ON "Song"("artistId");

-- Index 2: Song.district (discovery / district filter)
CREATE INDEX "Song_district_idx" ON "Song"("district");

-- Index 3: Song.isActive (filter active listings)
CREATE INDEX "Song_isActive_idx" ON "Song"("isActive");

-- Index 4: LicenseToken.holderId (FK lookup — holder's tokens)
CREATE INDEX "LicenseToken_holderId_idx" ON "LicenseToken"("holderId");

-- Index 5: Transaction.userId (FK lookup — user's transactions)
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- Index 6: Transaction.songId (FK lookup — song's transactions)
CREATE INDEX "Transaction_songId_idx" ON "Transaction"("songId");

-- Index 7: Payout.userId (FK lookup — user's payouts)
CREATE INDEX "Payout_userId_idx" ON "Payout"("userId");

-- Index 8: Payout.songId (FK lookup — song's payouts)
CREATE INDEX "Payout_songId_idx" ON "Payout"("songId");

-- Index 9: AdPlacement.ownerId (FK lookup — owner's ads)
CREATE INDEX "AdPlacement_ownerId_idx" ON "AdPlacement"("ownerId");
