-- Round 2 economy: consumables, reward chests, per-question item use (docs/api-economy.md).
-- CreateEnum
CREATE TYPE "ConsumableKind" AS ENUM ('chosung_first', 'remove_wrong_choice');

-- CreateEnum
CREATE TYPE "ChestTier" AS ENUM ('normal', 'good');

-- AlterEnum
ALTER TYPE "CheeseReason" ADD VALUE 'chest_reward';

-- CreateTable
CREATE TABLE "UserConsumable" (
    "userId" UUID NOT NULL,
    "kind" "ConsumableKind" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserConsumable_pkey" PRIMARY KEY ("userId","kind")
);

-- CreateTable
CREATE TABLE "Chest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tier" "ChestTier" NOT NULL,
    "sourceTopicId" TEXT NOT NULL,
    "sourceLevel" INTEGER NOT NULL,
    "sourceSetAttemptId" UUID,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMPTZ(3),
    "rewards" JSONB,

    CONSTRAINT "Chest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemUse" (
    "setAttemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "kind" "ConsumableKind" NOT NULL,
    "userId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemUse_pkey" PRIMARY KEY ("setAttemptId","questionId","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chest_sourceSetAttemptId_key" ON "Chest"("sourceSetAttemptId");

-- CreateIndex
CREATE INDEX "Chest_userId_openedAt_idx" ON "Chest"("userId", "openedAt");

-- CreateIndex
CREATE INDEX "ItemUse_userId_idx" ON "ItemUse"("userId");

-- AddForeignKey
ALTER TABLE "UserConsumable" ADD CONSTRAINT "UserConsumable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chest" ADD CONSTRAINT "Chest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chest" ADD CONSTRAINT "Chest_sourceSetAttemptId_fkey" FOREIGN KEY ("sourceSetAttemptId") REFERENCES "SetAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUse" ADD CONSTRAINT "ItemUse_setAttemptId_fkey" FOREIGN KEY ("setAttemptId") REFERENCES "SetAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUse" ADD CONSTRAINT "ItemUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- raw: consumable quantity never negative (purchases/uses run under advisory xact locks).
ALTER TABLE "UserConsumable" ADD CONSTRAINT "UserConsumable_quantity_check" CHECK ("quantity" >= 0);
