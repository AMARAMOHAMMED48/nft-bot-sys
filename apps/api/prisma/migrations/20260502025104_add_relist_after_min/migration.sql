-- AlterTable
ALTER TABLE "User" ADD COLUMN     "relistAfterMin" INTEGER NOT NULL DEFAULT 1440;

-- AlterTable
ALTER TABLE "UserCollection" ADD COLUMN     "relistAfterMin" INTEGER;
