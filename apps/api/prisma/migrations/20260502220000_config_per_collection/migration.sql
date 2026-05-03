-- Migration: config par collection uniquement
-- offerBelowFloorPct, stopLossPct, offerMaxActive passent sur UserCollection (required)
-- offerExpiryMin, relistAfterMin restent sur User uniquement
-- offerBelowFloorPct, stopLossPct, offerMaxActive supprimés de User

-- 1. Backfill valeurs par défaut sur UserCollection avant passage en NOT NULL
UPDATE "UserCollection" SET "offerBelowFloorPct" = 5.0  WHERE "offerBelowFloorPct" IS NULL;
UPDATE "UserCollection" SET "stopLossPct"        = 10.0 WHERE "stopLossPct" IS NULL;

-- 2. Passer offerBelowFloorPct et stopLossPct en NOT NULL
ALTER TABLE "UserCollection" ALTER COLUMN "offerBelowFloorPct" SET NOT NULL;
ALTER TABLE "UserCollection" ALTER COLUMN "stopLossPct"        SET NOT NULL;

-- 3. Ajouter offerMaxActive sur UserCollection
ALTER TABLE "UserCollection" ADD COLUMN "offerMaxActive" INTEGER NOT NULL DEFAULT 5;

-- 4. Supprimer offerExpiryMin et relistAfterMin de UserCollection
ALTER TABLE "UserCollection" DROP COLUMN IF EXISTS "offerExpiryMin";
ALTER TABLE "UserCollection" DROP COLUMN IF EXISTS "relistAfterMin";

-- 5. Supprimer offerBelowFloorPct, stopLossPct, offerMaxActive de User
ALTER TABLE "User" DROP COLUMN IF EXISTS "offerBelowFloorPct";
ALTER TABLE "User" DROP COLUMN IF EXISTS "stopLossPct";
ALTER TABLE "User" DROP COLUMN IF EXISTS "offerMaxActive";
