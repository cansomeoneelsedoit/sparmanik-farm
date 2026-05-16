-- AiConversation: per-user grouping of Ask AI messages so we can show a
-- sidebar of past chats (ChatGPT / Claude.ai style).

CREATE TABLE "ai_conversations" (
    "id"         TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "title"      TEXT,
    "provider"   TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_conversations_user_id_updated_at_idx"
    ON "ai_conversations"("user_id", "updated_at");

ALTER TABLE "ai_conversations"
    ADD CONSTRAINT "ai_conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- AiMessage gets a conversation_id, nullable for historical rows during the
-- transition; the backfill below assigns each user's existing messages to a
-- single synthetic conversation so they remain reachable in the sidebar.
ALTER TABLE "ai_messages" ADD COLUMN "conversation_id" TEXT;

-- One synthetic "Earlier chats" conversation per user-with-history.
INSERT INTO "ai_conversations" ("id", "user_id", "title", "created_at", "updated_at")
SELECT
    'conv_legacy_' || user_id,
    user_id,
    'Earlier chats',
    MIN(created_at),
    MAX(created_at)
FROM "ai_messages"
GROUP BY user_id
ON CONFLICT DO NOTHING;

UPDATE "ai_messages"
SET conversation_id = 'conv_legacy_' || user_id
WHERE conversation_id IS NULL;

CREATE INDEX "ai_messages_conversation_id_created_at_idx"
    ON "ai_messages"("conversation_id", "created_at");

ALTER TABLE "ai_messages"
    ADD CONSTRAINT "ai_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE;

-- Staff <-> User link. The user-create + backfill (with bcrypt-hashed default
-- password) happens at app boot in prisma/seed.ts, since SQL can't bcrypt.
ALTER TABLE "staff" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");
ALTER TABLE "staff"
    ADD CONSTRAINT "staff_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
