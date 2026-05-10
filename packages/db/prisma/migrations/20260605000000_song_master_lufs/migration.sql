-- Surface the integrated LUFS captured at publish time on the track
-- page, so license shoppers know whether the master is stream-ready
-- (-14 LUFS target) before they hand over money.
--
-- Nullable: legacy tracks published before this field existed have no
-- captured LUFS, and imports that bypass the studio (direct upload via
-- /studio/new) won't carry this either. The track page treats null as
-- "no measurement available" rather than "0 LUFS".

ALTER TABLE "Song"
  ADD COLUMN IF NOT EXISTS "masterLufs" DOUBLE PRECISION;
