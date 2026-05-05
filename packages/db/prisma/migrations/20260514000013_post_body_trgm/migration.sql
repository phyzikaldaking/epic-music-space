-- Trigram index on Post.body to make hashtag-style ILIKE/contains queries
-- (used by /explore?tag=… via GET /api/posts) drop from a sequential scan
-- to an index scan as posts grow. The pg_trgm extension exists on Supabase
-- by default; CREATE EXTENSION IF NOT EXISTS is a no-op if it's already
-- enabled. Index lookups via prisma's `contains: "#tag", mode: "insensitive"`
-- compile to ILIKE under the hood, which the gin_trgm_ops opclass
-- accelerates directly.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Post_body_trgm_idx"
  ON "Post" USING gin ("body" gin_trgm_ops);
