-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('chosung', 'mcq', 'ox');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('draft', 'reviewed', 'published', 'suspended');

-- CreateEnum
CREATE TYPE "SolveMode" AS ENUM ('stage', 'composite', 'daily', 'quest', 'placement', 'basic_test', 'battle', 'diagnostic');

-- CreateEnum
CREATE TYPE "SetKind" AS ENUM ('stage', 'composite', 'daily', 'quest', 'placement', 'basic_test', 'diagnostic');

-- CreateEnum
CREATE TYPE "SetAttemptStatus" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "XpSourceType" AS ENUM ('stage', 'composite', 'daily', 'quest', 'battle');

-- CreateEnum
CREATE TYPE "CheeseReason" AS ENUM ('streak_milestone', 'protection_purchase', 'protection_use', 'streak_restore', 'item_purchase', 'seed_adjust');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('lobby', 'playing', 'finished', 'dissolved');

-- CreateEnum
CREATE TYPE "ItemSlot" AS ENUM ('hat', 'top', 'bottom', 'shoes', 'accessory');

-- CreateEnum
CREATE TYPE "ItemAcquireKind" AS ENUM ('default', 'cheese', 'level');

-- CreateEnum
CREATE TYPE "AvatarSource" AS ENUM ('social', 'upload', 'character');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('kakao', 'naver', 'google');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('pending', 'accepted');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "IssueReportStatus" AS ENUM ('open', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "WrongNoteStatus" AS ENUM ('open', 'reviewed');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "nickname" VARCHAR(10) NOT NULL,
    "avatarSource" "AvatarSource" NOT NULL DEFAULT 'character',
    "avatarAssetKey" TEXT,
    "socialAvatarUrl" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" UUID NOT NULL,
    "nickname" VARCHAR(10),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mergedUserId" UUID,
    "mergedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "mvp" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subfield" (
    "id" UUID NOT NULL,
    "topicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Subfield_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "topicId" TEXT NOT NULL,
    "subfieldId" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "question" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "choices" TEXT[],
    "explanation" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "status" "QuestionStatus" NOT NULL DEFAULT 'draft',
    "recommendedDifficulty" DOUBLE PRECISION,
    "importBatch" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolveLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestId" UUID,
    "questionId" UUID NOT NULL,
    "mode" "SolveMode" NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "submitted" BOOLEAN NOT NULL DEFAULT true,
    "responseMs" INTEGER NOT NULL,
    "beforeReveal" BOOLEAN,
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "isReview" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMPTZ(3) NOT NULL,
    "kstDay" DATE NOT NULL,
    "setAttemptId" UUID,
    "battleResultId" UUID,

    CONSTRAINT "SolveLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestId" UUID,
    "kind" "SetKind" NOT NULL,
    "status" "SetAttemptStatus" NOT NULL DEFAULT 'in_progress',
    "topicId" TEXT,
    "level" INTEGER,
    "subfieldId" UUID,
    "questionIds" UUID[],
    "reviewQuestionIds" UUID[],
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN,
    "firstClear" BOOLEAN NOT NULL DEFAULT false,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "kstDay" DATE,
    "weekStart" DATE,
    "idempotencyKey" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SetAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "code" VARCHAR(4) NOT NULL,
    "hostUserId" UUID,
    "hostGuestId" UUID,
    "settings" JSONB NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'lobby',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomSession" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "questionIds" UUID[],
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RoomSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleResult" (
    "id" UUID NOT NULL,
    "roomSessionId" UUID NOT NULL,
    "participantId" TEXT NOT NULL,
    "userId" UUID,
    "guestId" UUID,
    "nickname" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalResponseMs" INTEGER NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "left" BOOLEAN NOT NULL DEFAULT false,
    "memberKey" TEXT NOT NULL,
    "rematch" BOOLEAN NOT NULL DEFAULT false,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "kstDay" DATE NOT NULL,

    CONSTRAINT "BattleResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheeseLedger" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestId" UUID,
    "delta" INTEGER NOT NULL,
    "reason" "CheeseReason" NOT NULL,
    "milestone" INTEGER,
    "runStartDay" DATE,
    "itemId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheeseLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpLedger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceType" "XpSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "preCapAmount" INTEGER NOT NULL,
    "cappedAmount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "configVersion" TEXT NOT NULL,
    "kstDay" DATE NOT NULL,
    "viaMerge" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicProgress" (
    "userId" UUID NOT NULL,
    "topicId" TEXT NOT NULL,
    "highestClearedStage" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TopicProgress_pkey" PRIMARY KEY ("userId","topicId")
);

-- CreateTable
CREATE TABLE "UserTopic" (
    "userId" UUID NOT NULL,
    "topicId" TEXT NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTopic_pkey" PRIMARY KEY ("userId","topicId")
);

-- CreateTable
CREATE TABLE "StreakState" (
    "userId" UUID NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "lastCountedDay" DATE,
    "runStartDay" DATE,
    "judgedThrough" DATE,
    "brokenMissedDay" DATE,
    "brokenLostLength" INTEGER,
    "brokenRunStartDay" DATE,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StreakState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WrongNote" (
    "userId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "status" "WrongNoteStatus" NOT NULL DEFAULT 'open',
    "wrongCount" INTEGER NOT NULL DEFAULT 1,
    "firstWrongAt" TIMESTAMPTZ(3) NOT NULL,
    "lastWrongAt" TIMESTAMPTZ(3) NOT NULL,
    "reviewedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WrongNote_pkey" PRIMARY KEY ("userId","questionId")
);

-- CreateTable
CREATE TABLE "WeeklyReportSnapshot" (
    "userId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "configVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReportSnapshot_pkey" PRIMARY KEY ("userId","weekStart")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "userLowId" UUID NOT NULL,
    "userHighId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("userLowId","userHighId")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "toUserId" UUID NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "slot" "ItemSlot" NOT NULL,
    "name" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "acquire" "ItemAcquireKind" NOT NULL,
    "price" INTEGER,
    "unlockLevel" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserItem" (
    "userId" UUID NOT NULL,
    "itemId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserItem_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "CharacterEquip" (
    "userId" UUID NOT NULL,
    "slot" "ItemSlot" NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "CharacterEquip_pkey" PRIMARY KEY ("userId","slot")
);

-- CreateTable
CREATE TABLE "Asset" (
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IssueReport" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceText" TEXT,
    "evidenceUrl" TEXT,
    "status" "IssueReportStatus" NOT NULL DEFAULT 'open',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");

-- CreateIndex
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_provider_providerUserId_key" ON "SocialAccount"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "Guest_mergedUserId_idx" ON "Guest"("mergedUserId");

-- CreateIndex
CREATE INDEX "Guest_lastSeenAt_idx" ON "Guest"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_name_key" ON "Topic"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subfield_topicId_name_key" ON "Subfield"("topicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Question_normalizedText_key" ON "Question"("normalizedText");

-- CreateIndex
CREATE INDEX "Question_status_topicId_type_difficulty_idx" ON "Question"("status", "topicId", "type", "difficulty");

-- CreateIndex
CREATE INDEX "Question_subfieldId_idx" ON "Question"("subfieldId");

-- CreateIndex
CREATE INDEX "SolveLog_userId_answeredAt_idx" ON "SolveLog"("userId", "answeredAt");

-- CreateIndex
CREATE INDEX "SolveLog_guestId_answeredAt_idx" ON "SolveLog"("guestId", "answeredAt");

-- CreateIndex
CREATE INDEX "SolveLog_userId_questionId_answeredAt_idx" ON "SolveLog"("userId", "questionId", "answeredAt");

-- CreateIndex
CREATE INDEX "SolveLog_questionId_idx" ON "SolveLog"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SolveLog_setAttemptId_questionId_userId_key" ON "SolveLog"("setAttemptId", "questionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SolveLog_setAttemptId_questionId_guestId_key" ON "SolveLog"("setAttemptId", "questionId", "guestId");

-- CreateIndex
CREATE UNIQUE INDEX "SolveLog_battleResultId_questionId_key" ON "SolveLog"("battleResultId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SetAttempt_idempotencyKey_key" ON "SetAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SetAttempt_userId_kind_topicId_level_idx" ON "SetAttempt"("userId", "kind", "topicId", "level");

-- CreateIndex
CREATE INDEX "SetAttempt_guestId_idx" ON "SetAttempt"("guestId");

-- CreateIndex
CREATE INDEX "SetAttempt_userId_kind_kstDay_idx" ON "SetAttempt"("userId", "kind", "kstDay");

-- CreateIndex
CREATE INDEX "Room_code_status_idx" ON "Room"("code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoomSession_roomId_seq_key" ON "RoomSession"("roomId", "seq");

-- CreateIndex
CREATE INDEX "BattleResult_userId_endedAt_idx" ON "BattleResult"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "BattleResult_guestId_idx" ON "BattleResult"("guestId");

-- CreateIndex
CREATE INDEX "BattleResult_memberKey_endedAt_idx" ON "BattleResult"("memberKey", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BattleResult_roomSessionId_participantId_key" ON "BattleResult"("roomSessionId", "participantId");

-- CreateIndex
CREATE INDEX "CheeseLedger_userId_createdAt_idx" ON "CheeseLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CheeseLedger_guestId_idx" ON "CheeseLedger"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "CheeseLedger_userId_milestone_runStartDay_key" ON "CheeseLedger"("userId", "milestone", "runStartDay");

-- CreateIndex
CREATE INDEX "XpLedger_userId_kstDay_idx" ON "XpLedger"("userId", "kstDay");

-- CreateIndex
CREATE UNIQUE INDEX "XpLedger_sourceType_sourceId_userId_key" ON "XpLedger"("sourceType", "sourceId", "userId");

-- CreateIndex
CREATE INDEX "WrongNote_userId_status_idx" ON "WrongNote"("userId", "status");

-- CreateIndex
CREATE INDEX "Friendship_userHighId_idx" ON "Friendship"("userHighId");

-- CreateIndex
CREATE INDEX "Invite_toUserId_status_idx" ON "Invite"("toUserId", "status");

-- CreateIndex
CREATE INDEX "IssueReport_status_idx" ON "IssueReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IssueReport_questionId_reporterId_key" ON "IssueReport"("questionId", "reporterId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarAssetKey_fkey" FOREIGN KEY ("avatarAssetKey") REFERENCES "Asset"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_mergedUserId_fkey" FOREIGN KEY ("mergedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subfield" ADD CONSTRAINT "Subfield_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subfieldId_fkey" FOREIGN KEY ("subfieldId") REFERENCES "Subfield"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolveLog" ADD CONSTRAINT "SolveLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolveLog" ADD CONSTRAINT "SolveLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolveLog" ADD CONSTRAINT "SolveLog_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolveLog" ADD CONSTRAINT "SolveLog_setAttemptId_fkey" FOREIGN KEY ("setAttemptId") REFERENCES "SetAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolveLog" ADD CONSTRAINT "SolveLog_battleResultId_fkey" FOREIGN KEY ("battleResultId") REFERENCES "BattleResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetAttempt" ADD CONSTRAINT "SetAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetAttempt" ADD CONSTRAINT "SetAttempt_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSession" ADD CONSTRAINT "RoomSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleResult" ADD CONSTRAINT "BattleResult_roomSessionId_fkey" FOREIGN KEY ("roomSessionId") REFERENCES "RoomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleResult" ADD CONSTRAINT "BattleResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleResult" ADD CONSTRAINT "BattleResult_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheeseLedger" ADD CONSTRAINT "CheeseLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheeseLedger" ADD CONSTRAINT "CheeseLedger_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicProgress" ADD CONSTRAINT "TopicProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicProgress" ADD CONSTRAINT "TopicProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopic" ADD CONSTRAINT "UserTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopic" ADD CONSTRAINT "UserTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakState" ADD CONSTRAINT "StreakState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongNote" ADD CONSTRAINT "WrongNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongNote" ADD CONSTRAINT "WrongNote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReportSnapshot" ADD CONSTRAINT "WeeklyReportSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userLowId_fkey" FOREIGN KEY ("userLowId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userHighId_fkey" FOREIGN KEY ("userHighId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_imageKey_fkey" FOREIGN KEY ("imageKey") REFERENCES "Asset"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterEquip" ADD CONSTRAINT "CharacterEquip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterEquip" ADD CONSTRAINT "CharacterEquip_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueReport" ADD CONSTRAINT "IssueReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueReport" ADD CONSTRAINT "IssueReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- raw: constraints Prisma cannot express (plan §2.3(a)). Keep when editing later migrations.
-- ============================================================================

-- raw: owner = exactly one of userId / guestId on the four source tables.
ALTER TABLE "SolveLog" ADD CONSTRAINT "SolveLog_owner_check" CHECK (num_nonnulls("userId", "guestId") = 1);
ALTER TABLE "SetAttempt" ADD CONSTRAINT "SetAttempt_owner_check" CHECK (num_nonnulls("userId", "guestId") = 1);
ALTER TABLE "BattleResult" ADD CONSTRAINT "BattleResult_owner_check" CHECK (num_nonnulls("userId", "guestId") = 1);
ALTER TABLE "CheeseLedger" ADD CONSTRAINT "CheeseLedger_owner_check" CHECK (num_nonnulls("userId", "guestId") = 1);

-- raw: every SolveLog belongs to exactly one set or one battle (idempotency keys depend on it).
ALTER TABLE "SolveLog" ADD CONSTRAINT "SolveLog_source_check" CHECK (num_nonnulls("setAttemptId", "battleResultId") = 1);

-- raw: milestone cheese rows carry their idempotency key (userId, milestone, runStartDay).
ALTER TABLE "CheeseLedger" ADD CONSTRAINT "CheeseLedger_milestone_check"
  CHECK ("reason" <> 'streak_milestone' OR ("milestone" IS NOT NULL AND "runStartDay" IS NOT NULL));

-- raw: a guest is merged at most once, into one user (spec: 한 임시 ID는 한 계정에만).
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_merged_pair_check" CHECK (("mergedUserId" IS NULL) = ("mergedAt" IS NULL));
CREATE FUNCTION "guest_merge_once"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."mergedUserId" IS NOT NULL AND NEW."mergedUserId" IS DISTINCT FROM OLD."mergedUserId" THEN
    RAISE EXCEPTION 'guest % is already merged', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Guest_merge_once" BEFORE UPDATE OF "mergedUserId" ON "Guest"
  FOR EACH ROW EXECUTE FUNCTION "guest_merge_once"();

-- raw: question difficulty ★1–5 in 0.5 steps; mcq has exactly 4 choices, others none.
ALTER TABLE "Question" ADD CONSTRAINT "Question_difficulty_check"
  CHECK ("difficulty" BETWEEN 1 AND 5 AND "difficulty" * 2 = floor("difficulty" * 2));
ALTER TABLE "Question" ADD CONSTRAINT "Question_recommended_difficulty_check"
  CHECK ("recommendedDifficulty" IS NULL OR ("recommendedDifficulty" BETWEEN 1 AND 5 AND "recommendedDifficulty" * 2 = floor("recommendedDifficulty" * 2)));
ALTER TABLE "Question" ADD CONSTRAINT "Question_choices_check"
  CHECK (("type" = 'mcq' AND cardinality("choices") = 4) OR ("type" <> 'mcq' AND cardinality("choices") = 0));

-- raw: issue reports need evidence text or a link (AC-C6).
ALTER TABLE "IssueReport" ADD CONSTRAINT "IssueReport_evidence_check"
  CHECK (coalesce(btrim("evidenceText"), '') <> '' OR coalesce(btrim("evidenceUrl"), '') <> '');

-- raw: one friendship row per pair, ordered, requester is one of the pair.
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_order_check"
  CHECK ("userLowId" < "userHighId" AND "requesterId" IN ("userLowId", "userHighId"));
