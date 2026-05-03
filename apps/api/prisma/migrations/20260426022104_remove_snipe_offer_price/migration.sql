/*
  Warnings:

  - You are about to drop the column `buyTriggerPct` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `maxPositions` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `offerPriceEth` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `offerPriceEth` on the `UserCollection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "buyTriggerPct",
DROP COLUMN "maxPositions",
DROP COLUMN "offerPriceEth";

-- AlterTable
ALTER TABLE "UserCollection" DROP COLUMN "offerPriceEth",
ADD COLUMN     "offerBelowFloor" DOUBLE PRECISION;
