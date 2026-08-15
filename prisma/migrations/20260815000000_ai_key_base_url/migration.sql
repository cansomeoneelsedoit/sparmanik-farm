-- Additive: per-key OpenAI-compatible base URL (enables provider="custom" endpoints).
ALTER TABLE "ai_provider_keys" ADD COLUMN "base_url" TEXT;
