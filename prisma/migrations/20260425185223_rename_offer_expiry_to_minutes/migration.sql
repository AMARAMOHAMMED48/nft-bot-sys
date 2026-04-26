/*
  Warnings:

  - You are about to drop the column `offerExpiryH` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "offerExpiryH",
ADD COLUMN     "offerExpiryMin" INTEGER NOT NULL DEFAULT 1440;
