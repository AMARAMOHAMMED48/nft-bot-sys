-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'trader',
    "walletAddress" TEXT,
    "walletKeyEnc" TEXT,
    "paperTrading" BOOLEAN NOT NULL DEFAULT true,
    "offerPriceEth" DOUBLE PRECISION,
    "offerMaxActive" INTEGER NOT NULL DEFAULT 5,
    "budgetMaxEth" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "stopLossEth" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "buyTriggerPct" DOUBLE PRECISION NOT NULL DEFAULT 0.88,
    "maxGasGwei" INTEGER NOT NULL DEFAULT 35,
    "timeoutSellH" INTEGER NOT NULL DEFAULT 72,
    "maxPositions" INTEGER NOT NULL DEFAULT 3,
    "botEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discordWebhook" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionAddress" TEXT NOT NULL,
    "collectionName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "buyPrice" DOUBLE PRECISION NOT NULL,
    "buyTxHash" TEXT,
    "listPrice" DOUBLE PRECISION,
    "sellPrice" DOUBLE PRECISION,
    "sellTxHash" TEXT,
    "gasBuy" DOUBLE PRECISION,
    "gasSell" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "isPaperTrade" BOOLEAN NOT NULL DEFAULT true,
    "boughtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "offerPrice" DOUBLE PRECISION NOT NULL,
    "floorAtOffer" DOUBLE PRECISION NOT NULL,
    "offerTxHash" TEXT,
    "status" TEXT NOT NULL,
    "isPaperTrade" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorSnapshot" (
    "id" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "floorPrice" DOUBLE PRECISION NOT NULL,
    "volume24h" DOUBLE PRECISION,
    "listings" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "level" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserCollection_userId_idx" ON "UserCollection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCollection_userId_collectionAddress_key" ON "UserCollection"("userId", "collectionAddress");

-- CreateIndex
CREATE INDEX "Trade_userId_status_idx" ON "Trade"("userId", "status");

-- CreateIndex
CREATE INDEX "Trade_userId_boughtAt_idx" ON "Trade"("userId", "boughtAt");

-- CreateIndex
CREATE INDEX "Offer_userId_status_idx" ON "Offer"("userId", "status");

-- CreateIndex
CREATE INDEX "FloorSnapshot_collection_recordedAt_idx" ON "FloorSnapshot"("collection", "recordedAt");

-- CreateIndex
CREATE INDEX "BotLog_userId_createdAt_idx" ON "BotLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BotLog_level_createdAt_idx" ON "BotLog"("level", "createdAt");

-- AddForeignKey
ALTER TABLE "UserCollection" ADD CONSTRAINT "UserCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotLog" ADD CONSTRAINT "BotLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
