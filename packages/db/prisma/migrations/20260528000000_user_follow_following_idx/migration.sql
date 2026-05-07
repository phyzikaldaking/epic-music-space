-- Index on UserFollow.followingId so reverse-lookups ("who follows artist X")
-- stop full-scanning the table. The existing unique constraint
-- (followerId, followingId) already covers forward-direction queries via
-- its leftmost prefix, but reverse queries — feed fan-out, follower lists,
-- notifications, the "Followers" tab — were unindexed.
CREATE INDEX IF NOT EXISTS "UserFollow_followingId_idx" ON "UserFollow"("followingId");
