-- Rename offerBelowFloor → offerBelowFloorPct (User)
ALTER TABLE "User" RENAME COLUMN "offerBelowFloor" TO "offerBelowFloorPct";

-- Rename stopLossEth → stopLossPct (User), default 10 (%)
ALTER TABLE "User" RENAME COLUMN "stopLossEth" TO "stopLossPct";
ALTER TABLE "User" ALTER COLUMN "stopLossPct" SET DEFAULT 10;
UPDATE "User" SET "stopLossPct" = 10 WHERE "stopLossPct" = 0.15;

-- Rename offerBelowFloor → offerBelowFloorPct (UserCollection)
ALTER TABLE "UserCollection" RENAME COLUMN "offerBelowFloor" TO "offerBelowFloorPct";

-- Add stopLossPct to UserCollection
ALTER TABLE "UserCollection" ADD COLUMN "stopLossPct" DOUBLE PRECISION;
