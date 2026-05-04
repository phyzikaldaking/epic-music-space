-- AddValue: BOOST and SUBSCRIPTION to RevenueEventType enum
-- In PostgreSQL, ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
-- so each statement is separate.
ALTER TYPE "RevenueEventType" ADD VALUE IF NOT EXISTS 'BOOST';
ALTER TYPE "RevenueEventType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';
