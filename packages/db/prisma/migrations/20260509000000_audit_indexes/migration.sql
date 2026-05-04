-- CreateIndex
CREATE INDEX "Auction_sellerId_status_idx" ON "Auction"("sellerId", "status");

-- CreateIndex
CREATE INDEX "RoomMessage_userId_createdAt_idx" ON "RoomMessage"("userId", "createdAt");
