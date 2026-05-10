-- Add templatePriceUsd to StudioProject (#28). NULL = not for sale.
-- 0 = free download. >0 = paid template. Combined with isTemplate=true
-- to surface a project as a marketplace listing.

ALTER TABLE "StudioProject" ADD COLUMN "templatePriceUsd" DECIMAL(10, 2);
