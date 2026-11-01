-- 경험치 부스트: a chest-only consumable, its bonus XP ledger rows, and the boosted sets left per user.
ALTER TYPE "ConsumableKind" ADD VALUE IF NOT EXISTS 'xp_boost';
ALTER TYPE "XpSourceType" ADD VALUE IF NOT EXISTS 'xp_boost';

CREATE TABLE "XpBoost" (
    "userId" UUID NOT NULL,
    "remainingSets" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "XpBoost_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "XpBoost" ADD CONSTRAINT "XpBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XpBoost" ADD CONSTRAINT "XpBoost_remainingSets_check" CHECK ("remainingSets" >= 0);
