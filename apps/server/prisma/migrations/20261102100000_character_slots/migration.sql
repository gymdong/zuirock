-- Character slots: hat/top/bottom/accessory → head/eyes/nose/shoes/tail (shoes stays as is).
-- Old-slot items go away, so cheese spent on them is refunded first. One transaction: a failed run
-- leaves nothing half-done (no double refund on retry). Safe on an empty database too.
BEGIN;

-- Refund what each owner paid (item_purchase rows for that item; the list price when no row exists).
-- Default and level-unlock items were free: no refund.
INSERT INTO "CheeseLedger" ("id", "userId", "delta", "reason", "itemId")
SELECT gen_random_uuid(), ui."userId", COALESCE(paid."amount", i."price"), 'seed_adjust', i."id"
FROM "UserItem" ui
JOIN "Item" i ON i."id" = ui."itemId"
LEFT JOIN LATERAL (
  SELECT -SUM(cl."delta")::int AS "amount"
  FROM "CheeseLedger" cl
  WHERE cl."userId" = ui."userId" AND cl."itemId" = i."id" AND cl."reason" = 'item_purchase'
) paid ON TRUE
WHERE i."slot" IN ('hat', 'top', 'bottom', 'accessory')
  AND i."acquire" = 'cheese'
  AND COALESCE(paid."amount", i."price", 0) > 0;

-- Asset rows (the images) stay; only the items and what points at them go.
DELETE FROM "CharacterEquip" WHERE "slot" IN ('hat', 'top', 'bottom', 'accessory');
DELETE FROM "UserItem" WHERE "itemId" IN (SELECT "id" FROM "Item" WHERE "slot" IN ('hat', 'top', 'bottom', 'accessory'));
DELETE FROM "Item" WHERE "slot" IN ('hat', 'top', 'bottom', 'accessory');

-- PostgreSQL cannot drop enum values: swap in a new type.
ALTER TYPE "ItemSlot" RENAME TO "ItemSlot_old";
CREATE TYPE "ItemSlot" AS ENUM ('head', 'eyes', 'nose', 'shoes', 'tail');
ALTER TABLE "Item" ALTER COLUMN "slot" TYPE "ItemSlot" USING ("slot"::text::"ItemSlot");
ALTER TABLE "CharacterEquip" ALTER COLUMN "slot" TYPE "ItemSlot" USING ("slot"::text::"ItemSlot");
DROP TYPE "ItemSlot_old";

COMMIT;
