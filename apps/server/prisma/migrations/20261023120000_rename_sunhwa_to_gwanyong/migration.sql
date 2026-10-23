-- Vocabulary subfield '순화어' is replaced by '관용표현' (content decision 2026-10-23).
-- Old questions keep their solve logs / wrong notes (RESTRICT FKs), so they are suspended, not deleted.
-- No-op on databases that never had the '순화어' subfield.
DO $$
DECLARE
  old_id uuid;
  new_id uuid;
BEGIN
  SELECT "id" INTO old_id FROM "Subfield" WHERE "topicId" = 'vocab' AND "name" = '순화어';
  IF old_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE "Question" SET "status" = 'suspended', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "subfieldId" = old_id AND "status" <> 'suspended';

  SELECT "id" INTO new_id FROM "Subfield" WHERE "topicId" = 'vocab' AND "name" = '관용표현';
  IF new_id IS NULL THEN
    UPDATE "Subfield" SET "name" = '관용표현' WHERE "id" = old_id;
  ELSE
    -- '관용표현' was already seeded: move the old rows over, then drop the empty '순화어'.
    UPDATE "Question" SET "subfieldId" = new_id WHERE "subfieldId" = old_id;
    UPDATE "SetAttempt" SET "subfieldId" = new_id WHERE "subfieldId" = old_id;
    DELETE FROM "Subfield" WHERE "id" = old_id;
  END IF;
END $$;
