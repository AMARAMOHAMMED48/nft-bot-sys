-- Migration: module snipe dédié

-- Table SnipeConfig (wallet + config globale snipe par user)
CREATE TABLE "SnipeConfig" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "walletAddress"  TEXT,
  "walletKeyEnc"   TEXT,
  "paperTrading"   BOOLEAN NOT NULL DEFAULT true,
  "enabled"        BOOLEAN NOT NULL DEFAULT false,
  "budgetMaxEth"   DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "maxGasGwei"     INTEGER NOT NULL DEFAULT 35,
  "maxPositions"   INTEGER NOT NULL DEFAULT 3,
  "ethReserveGas"  DOUBLE PRECISION NOT NULL DEFAULT 0.01,
  "discordWebhook" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SnipeConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SnipeConfig_userId_key" UNIQUE ("userId"),
  CONSTRAINT "SnipeConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Champs snipe sur UserCollection (optionnels, pas d'impact sur l'existant)
ALTER TABLE "UserCollection"
  ADD COLUMN "snipeEnabled"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "buyTriggerPct" DOUBLE PRECISION,
  ADD COLUMN "snipeMaxRank"  INTEGER;
