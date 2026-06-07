/**
 * Daisy-chained LLM provider router.
 *
 * Keep a ranked list of credentials (free Gemini accounts at the top,
 * paid Anthropic at the bottom). For every prompt, walk the list
 * top-to-bottom. Within a provider, retry once on transient network /
 * 5xx errors. On 429 / quota / 4xx, never retry — advance straight to
 * the next provider so the live quota isn't burnt waiting on a known-
 * dead key. Quotas reset daily, so the chain self-heals.
 *
 * Callers don't know which key answered: `ask({ prompt, json? })`
 * returns the text from whatever provider succeeded first.
 *
 * Two surfaces are exposed: `ask()` for text-only prompts (works on
 * every provider) and `askVision()` for image-bearing prompts (only
 * Gemini + Anthropic are wired today — Groq / Cerebras / etc. don't
 * accept images via the OpenAI-compatible shape we use).
 */
import { prisma } from "@/server/prisma";

export type AskOptions = {
  prompt: string;
  /** Defaults to 800. */
  maxTokens?: number;
  /** Gemini 2.5: skip the "thinking" budget, send all tokens to output. */
  disableThinking?: boolean;
  /** Force the response to be a JSON object. */
  json?: boolean;
  /** Defaults to 60_000 (60 s). */
  timeoutMs?: number;
  /** When true, callers get a verbose error mentioning which providers tried. */
  debug?: boolean;
};

/**
 * Anthropic accepts image bytes via `type: "image"` and PDF bytes via
 * `type: "document"`. Gemini accepts both via `inline_data` with the
 * right mime type. This union lets `askVision` accept either.
 */
export type VisionMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

export type AskVisionOptions = AskOptions & {
  /** Base64-encoded bytes. */
  imageBase64: string;
  /** "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf" */
  imageMediaType: VisionMediaType;
};

export type ProviderKind = "gemini" | "openai" | "anthropic";

export type Provider = {
  /** Database id if this came from AiProviderKey; null for env-backed providers. */
  dbId: string | null;
  /** Internal name e.g. "gemini", "groq", "anthropic-1". */
  name: string;
  /** Kind of API the provider speaks. */
  kind: ProviderKind;
  /** Real secret. Don't log. */
  apiKey: string;
  /** Model id the provider expects. */
  model: string;
  /** OpenAI-compatible base URL (only for kind=openai). */
  baseUrl?: string;
  /** "gemini" | "groq" | … — what's stored on AiProviderKey.provider. */
  providerSlug: string;
  /** Optional human label from AiProviderKey.label. */
  label?: string | null;
};

/** Default models per provider slug. Easy to override per-key in the DB. */
const DEFAULT_MODELS: Record<string, { kind: ProviderKind; model: string; baseUrl?: string }> = {
  gemini: { kind: "gemini", model: "gemini-2.5-flash" },
  groq: {
    kind: "openai",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  cerebras: {
    kind: "openai",
    model: "llama-3.3-70b",
    baseUrl: "https://api.cerebras.ai/v1",
  },
  openrouter: {
    kind: "openai",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  mistral: {
    kind: "openai",
    model: "mistral-small-latest",
    baseUrl: "https://api.mistral.ai/v1",
  },
  anthropic: { kind: "anthropic", model: "claude-sonnet-4-6" },
};

/**
 * Build the env-backed chain. This is the "no DB rows configured" fallback
 * — useful for first boots on a new org or when the user wants to ship
 * keys via Railway env vars without touching the settings UI.
 */
function buildEnvChain(): Provider[] {
  const e = process.env;
  const out: Provider[] = [];

  // Per-key model overrides so you can mix gemini-2.5-flash on the
  // primary account with gemini-flash-latest on the backup accounts.
  // Falls back to a sensible default if nothing's set.
  const addGemini = (name: string, key: string | undefined, modelOverride?: string) => {
    if (!key) return;
    out.push({
      dbId: null,
      name,
      kind: "gemini",
      apiKey: key,
      model: modelOverride || DEFAULT_MODELS.gemini.model,
      providerSlug: "gemini",
    });
  };
  addGemini(
    "env-gemini-1",
    e.GEMINI_API_KEY || e.BIZGPT_API_KEY,
    e.BIZGPT_MODEL || e.GEMINI_MODEL,
  );
  addGemini("env-gemini-2", e.GEMINI_API_KEY_2, e.GEMINI_MODEL_2 || "gemini-flash-latest");
  addGemini("env-gemini-3", e.GEMINI_API_KEY_3, e.GEMINI_MODEL_3 || "gemini-flash-latest");

  const addOpenAi = (name: string, slug: string, key: string | undefined) => {
    if (!key) return;
    const defaults = DEFAULT_MODELS[slug];
    if (!defaults || defaults.kind !== "openai") return;
    out.push({
      dbId: null,
      name,
      kind: "openai",
      apiKey: key,
      model: defaults.model,
      baseUrl: defaults.baseUrl,
      providerSlug: slug,
    });
  };
  addOpenAi("env-groq", "groq", e.GROQ_API_KEY);
  addOpenAi("env-cerebras", "cerebras", e.CEREBRAS_API_KEY);
  addOpenAi("env-openrouter", "openrouter", e.OPENROUTER_API_KEY);
  addOpenAi("env-mistral", "mistral", e.MISTRAL_API_KEY);

  if (e.ANTHROPIC_API_KEY) {
    out.push({
      dbId: null,
      name: "env-anthropic",
      kind: "anthropic",
      apiKey: e.ANTHROPIC_API_KEY,
      model: e.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic.model,
      providerSlug: "anthropic",
    });
  }

  // Optional explicit ordering override.
  const order = e.AI_PROVIDER_ORDER?.split(",").map((s) => s.trim());
  if (order && order.length) {
    return order
      .map((slug) => out.find((p) => p.providerSlug === slug || p.name.endsWith(slug)))
      .filter((p): p is Provider => !!p);
  }
  return out;
}

/**
 * Load DB-managed keys for the active org, ordered by rank asc. Falls
 * silently to env chain when none exist.
 */
async function loadDbChain(): Promise<Provider[]> {
  try {
    const rows = (await prisma.aiProviderKey.findMany({
      where: { enabled: true },
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        provider: true,
        label: true,
        apiKey: true,
        model: true,
      },
    })) as {
      id: string;
      provider: string;
      label: string | null;
      apiKey: string;
      model: string | null;
    }[];
    const providers: Provider[] = [];
    for (const r of rows) {
      const defaults = DEFAULT_MODELS[r.provider];
      if (!defaults) continue;
      providers.push({
        dbId: r.id,
        name: `db-${r.provider}-${r.id.slice(-4)}`,
        kind: defaults.kind,
        apiKey: r.apiKey,
        model: r.model || defaults.model,
        baseUrl: defaults.baseUrl,
        providerSlug: r.provider,
        label: r.label,
      });
    }
    return providers;
  } catch {
    // The table doesn't exist yet (e.g. mid-migration). Fall through.
    return [];
  }
}

/** Tagged error so the chain can decide retry vs advance. */
class ProviderError extends Error {
  constructor(public status: number, public body: string) {
    super(`upstream ${status}: ${body.slice(0, 160)}`);
  }
}

function isQuotaError(status: number, body: string): boolean {
  if (status === 429) return true;
  const b = body.toLowerCase();
  return (
    b.includes("quota") ||
    b.includes("rate limit") ||
    b.includes("rate_limit") ||
    b.includes("exceeded") ||
    b.includes("insufficient") ||
    b.includes("resource_exhausted")
  );
}

// ── Adapters ────────────────────────────────────────────────────────────

type CallShape = {
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
  disableThinking?: boolean;
  json?: boolean;
  /** Vision payload — images OR PDFs. Field name kept as `image` for
   * adapter brevity, but it carries any vision-capable media type. */
  image?: { base64: string; mediaType: VisionMediaType };
};

async function callGemini(p: Provider, o: CallShape): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.timeoutMs);
  try {
    const parts: Array<Record<string, unknown>> = [];
    if (o.image) {
      parts.push({ inline_data: { mime_type: o.image.mediaType, data: o.image.base64 } });
    }
    parts.push({ text: o.prompt });
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        p.model,
      )}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": p.apiKey },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: o.maxTokens,
            ...(o.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            ...(o.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) throw new ProviderError(res.status, await res.text().catch(() => ""));
    const j = (await res.json()) as {
      candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string }[] };
      }[];
      promptFeedback?: { blockReason?: string };
    };
    const text =
      j.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
    if (!text) {
      // Decode why this happened so the chain reports a useful message
      // (and decides whether to retry vs advance). Common causes:
      // - `MAX_TOKENS` with thinking budget eating all output (Gemini
      //   2.5-*): retryable by raising max_tokens or disabling thinking.
      // - `SAFETY`: model refused. Not retryable — advance.
      // - `promptFeedback.blockReason`: pre-flight block. Advance.
      const finish = j.candidates?.[0]?.finishReason ?? "";
      const block = j.promptFeedback?.blockReason ?? "";
      const reason = block || finish || "no text";
      // Treat "MAX_TOKENS" as 502 so the chain retries (the retry will
      // also fail on the same key, then advance — but at least the
      // retry-once policy gets a chance). Everything else: advance.
      throw new ProviderError(finish === "MAX_TOKENS" ? 502 : 400, reason);
    }
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAiCompatible(p: Provider, o: CallShape): Promise<string> {
  if (o.image) {
    throw new ProviderError(
      400,
      "OpenAI-compatible providers don't support images via this chain",
    );
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.timeoutMs);
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        model: p.model,
        max_tokens: o.maxTokens,
        messages: [{ role: "user", content: o.prompt }],
        ...(o.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new ProviderError(res.status, await res.text().catch(() => ""));
    const j = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = j.choices?.[0]?.message?.content ?? "";
    if (!text) throw new ProviderError(502, "no text");
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function callAnthropic(p: Provider, o: CallShape): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.timeoutMs);
  try {
    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      | { type: "document"; source: { type: "base64"; media_type: string; data: string } };
    const userContent: ContentBlock[] = [];
    if (o.image) {
      // Anthropic uses a different block type for PDFs vs images. Same
      // base64 payload either way; just the wrapper changes.
      const isPdf = o.image.mediaType === "application/pdf";
      userContent.push({
        type: isPdf ? "document" : "image",
        source: { type: "base64", media_type: o.image.mediaType, data: o.image.base64 },
      });
    }
    userContent.push({
      type: "text",
      text: o.json ? `${o.prompt}\n\nRespond with ONLY a JSON object, no markdown.` : o.prompt,
    });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": p.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: p.model,
        max_tokens: o.maxTokens,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new ProviderError(res.status, await res.text().catch(() => ""));
    const j = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (j.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
    if (!text) throw new ProviderError(502, "no text");
    return text;
  } finally {
    clearTimeout(t);
  }
}

function callProvider(p: Provider, o: CallShape): Promise<string> {
  if (p.kind === "gemini") return callGemini(p, o);
  if (p.kind === "anthropic") return callAnthropic(p, o);
  return callOpenAiCompatible(p, o);
}

/**
 * Update the AiProviderKey row after a call so the user can see in the
 * settings UI which key was last used / which is rate-limited today.
 * Fire-and-forget — never block the response on this write.
 */
function recordOutcome(
  dbId: string | null,
  outcome: "ok" | "quota" | "error",
  error?: string,
): void {
  if (!dbId) return;
  // Wrap in setImmediate so the await chain doesn't hold the response.
  void (async () => {
    try {
      await prisma.aiProviderKey.update({
        where: { id: dbId },
        data: {
          lastStatus: outcome,
          lastUsedAt: new Date(),
          lastError: outcome === "ok" ? null : error?.slice(0, 240) ?? null,
        },
      });
    } catch {
      // Best effort; we don't want a DB blip to break Ask AI.
    }
  })();
}

async function runChain(
  chain: Provider[],
  o: CallShape,
  debug: boolean,
): Promise<string> {
  if (!chain.length) throw new Error("No AI provider configured");
  const tried: string[] = [];
  let lastErr: unknown = null;
  for (const p of chain) {
    tried.push(p.name);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const text = await callProvider(p, o);
        recordOutcome(p.dbId, "ok");
        return text;
      } catch (e) {
        lastErr = e;
        if (e instanceof ProviderError) {
          if (isQuotaError(e.status, e.body) || (e.status >= 400 && e.status < 500)) {
            recordOutcome(
              p.dbId,
              isQuotaError(e.status, e.body) ? "quota" : "error",
              `${e.status}: ${e.body.slice(0, 200)}`,
            );
            break; // advance to next provider
          }
          // 5xx — retry once with a tiny backoff.
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
            continue;
          }
          recordOutcome(p.dbId, "error", `${e.status}: ${e.body.slice(0, 200)}`);
          break;
        }
        // Network / abort error.
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        recordOutcome(p.dbId, "error", (e as Error).message);
        break;
      }
    }
  }
  const lastMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  const detail = debug ? ` (tried: ${tried.join(" → ")})` : "";
  throw new Error(`All ${chain.length} AI providers exhausted. Last: ${lastMsg}${detail}`);
}

/**
 * Walk the chain and return the first successful text response. Filters
 * to text-capable providers (every kind is text-capable today, but this
 * future-proofs against, e.g., voice-only providers).
 */
export async function ask(opts: AskOptions): Promise<string> {
  const chain = [...(await loadDbChain()), ...buildEnvChain()];
  const o: CallShape = {
    prompt: opts.prompt,
    maxTokens: opts.maxTokens ?? 800,
    timeoutMs: opts.timeoutMs ?? 60_000,
    disableThinking: opts.disableThinking,
    json: opts.json,
  };
  return runChain(chain, o, !!opts.debug);
}

/**
 * Vision-bearing variant. Filters the chain to providers whose adapter
 * accepts an image / document payload (Gemini + Anthropic), then walks
 * the same advance/retry semantics. Used by receipt OCR (which accepts
 * images and PDFs) + visual item identifier (images only).
 */
export async function askVision(opts: AskVisionOptions): Promise<string> {
  const fullChain = [...(await loadDbChain()), ...buildEnvChain()];
  const visionChain = fullChain.filter(
    (p) => p.kind === "gemini" || p.kind === "anthropic",
  );
  if (!visionChain.length) {
    throw new Error(
      "No vision-capable AI provider configured. Add a Gemini or Anthropic key under Settings → AI keys.",
    );
  }
  const o: CallShape = {
    prompt: opts.prompt,
    maxTokens: opts.maxTokens ?? 1024,
    timeoutMs: opts.timeoutMs ?? 90_000,
    disableThinking: opts.disableThinking,
    json: opts.json,
    image: { base64: opts.imageBase64, mediaType: opts.imageMediaType },
  };
  return runChain(visionChain, o, !!opts.debug);
}

/**
 * Hit a single provider in isolation. Used by the settings UI's "Test"
 * button so users can verify a key works without running it through the
 * full fallback chain. Returns either the response text or a typed
 * error result.
 */
export async function testProviderKey(opts: {
  provider: string;
  apiKey: string;
  model?: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const defaults = DEFAULT_MODELS[opts.provider];
  if (!defaults) return { ok: false, error: `Unknown provider "${opts.provider}"` };
  const p: Provider = {
    dbId: null,
    name: `test-${opts.provider}`,
    kind: defaults.kind,
    apiKey: opts.apiKey,
    model: opts.model || defaults.model,
    baseUrl: defaults.baseUrl,
    providerSlug: opts.provider,
  };
  try {
    // disableThinking is CRITICAL for Gemini 2.5-* models: a tiny test
    // prompt with low max_tokens will otherwise consume the entire token
    // budget on the hidden "thinking" step and return zero output, which
    // surfaces as a misleading "upstream 502: no text" error on what is
    // actually a valid key. Bumping max_tokens gives every provider room
    // to comfortably answer a short "say OK" prompt.
    const text = await callProvider(p, {
      prompt: "Reply with exactly the word OK and nothing else.",
      maxTokens: 64,
      timeoutMs: 15_000,
      disableThinking: true,
    });
    return { ok: true, text: text.trim() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}

/** Public surface for status displays (no secrets). */
export type ChainStatusRow = {
  name: string;
  providerSlug: string;
  source: "db" | "env";
  hasKey: boolean;
};

/** Summarise the current chain. Caller-side; safe to surface to the UI. */
export async function describeChain(): Promise<ChainStatusRow[]> {
  const dbChain = await loadDbChain();
  const envChain = buildEnvChain();
  return [
    ...dbChain.map((p) => ({
      name: p.label || p.providerSlug,
      providerSlug: p.providerSlug,
      source: "db" as const,
      hasKey: !!p.apiKey,
    })),
    ...envChain.map((p) => ({
      name: p.name,
      providerSlug: p.providerSlug,
      source: "env" as const,
      hasKey: !!p.apiKey,
    })),
  ];
}

export const SUPPORTED_PROVIDERS = Object.keys(DEFAULT_MODELS) as Array<
  keyof typeof DEFAULT_MODELS
>;
