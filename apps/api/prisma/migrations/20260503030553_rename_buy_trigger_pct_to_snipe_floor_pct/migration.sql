/*
  Warnings:

  - You are about to drop the column `buyTriggerPct` on the `UserCollection` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "SnipeConfig" DROP CONSTRAINT "SnipeConfig_userId_fkey";

-- AlterTable
ALTER TABLE "UserCollection" DROP COLUMN "buyTriggerPct",
ADD COLUMN     "snipeFloorPct" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "SnipeConfig" ADD CONSTRAINT "SnipeConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
