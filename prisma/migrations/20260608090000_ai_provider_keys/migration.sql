-- AiProviderKey: ranked list of LLM credentials per org. The ai-chain.ts
-- walks them top-to-bottom (lowest rank first), retries network/5xx once,
-- and advances on 429/quota/4xx so a hot key never wastes a retry on a
-- known-dead account. Real keys never reach the client — server actions
-- expose only the last 6 chars for display.

CREATE TABLE "ai_provider_keys" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT,
  "provider"        TEXT NOT NULL,    -- gemini | groq | cerebras | openrouter | mistral | anthropic
  "label"           TEXT,             -- "Primary", "Boyd backup", etc.
  "api_key"         TEXT NOT NULL,
  "model"           TEXT,             -- override for the default model on that provider
  "rank"            INTEGER NOT NULL DEFAULT 100,
  "enabled"         BOOLEAN NOT NULL DEFAULT true,
  "last_status"     TEXT,             -- "ok" | "quota" | "error" | "untested"
  "last_used_at"    TIMESTAMP(3),
  "last_error"      TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_provider_keys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_provider_keys_organization_id_idx" ON "ai_provider_keys"("organization_id");
CREATE INDEX "ai_provider_keys_rank_idx" ON "ai_provider_keys"("rank");

ALTER TABLE "ai_provider_keys" ADD CONSTRAINT "ai_provider_keys_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
