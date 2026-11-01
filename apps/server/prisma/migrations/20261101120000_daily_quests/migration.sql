-- Daily quests: a "quest" chest tier, and chests that are not tied to a stage.
ALTER TYPE "ChestTier" ADD VALUE IF NOT EXISTS 'quest';
ALTER TABLE "Chest" ALTER COLUMN "sourceTopicId" DROP NOT NULL;
ALTER TABLE "Chest" ALTER COLUMN "sourceLevel" DROP NOT NULL;
ALTER TABLE "Chest" ADD COLUMN "questKey" TEXT;
CREATE UNIQUE INDEX "Chest_userId_questKey_key" ON "Chest"("userId", "questKey");
