-- Solo hint (POST /api/solo/sets/:id/hint): chosung questions whose hint was opened.
ALTER TABLE "SetAttempt" ADD COLUMN     "hintedQuestionIds" UUID[] DEFAULT ARRAY[]::UUID[];
