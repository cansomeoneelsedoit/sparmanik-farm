-- Ask AI: image attachments on USER messages (vision support)
ALTER TABLE "ai_messages" ADD COLUMN "attachments" JSONB;
