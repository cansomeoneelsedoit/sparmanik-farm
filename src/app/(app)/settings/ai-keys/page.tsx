import { prisma } from "@/server/prisma";
import { describeChain, SUPPORTED_PROVIDERS } from "@/server/ai-chain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiKeyManager } from "@/app/(app)/settings/ai-keys/ai-key-manager";

export const dynamic = "force-dynamic";

/** Show only the last 6 characters; everything before is dots. */
function maskKey(raw: string): string {
  const tail = raw.slice(-6);
  return `${"•".repeat(Math.max(6, Math.min(20, raw.length - 6)))}${tail}`;
}

export default async function AiKeysSettingsPage() {
  const [rows, chain] = await Promise.all([
    prisma.aiProviderKey.findMany({
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    }),
    describeChain(),
  ]);

  type AiKeyRow = {
    id: string;
    provider: string;
    label: string | null;
    apiKey: string;
    model: string | null;
    rank: number;
    enabled: boolean;
    lastStatus: string | null;
    lastUsedAt: Date | null;
    lastError: string | null;
  };

  const masked = (rows as AiKeyRow[]).map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    maskedKey: maskKey(r.apiKey),
    keyLength: r.apiKey.length,
    model: r.model,
    rank: r.rank,
    enabled: r.enabled,
    lastStatus: r.lastStatus,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    lastError: r.lastError,
  }));

  // Env-backed providers (read from .env or Railway dashboard) are listed
  // separately so the user knows the chain has them as a safety net even
  // when the DB table is empty.
  const envProviders = chain.filter((c) => c.source === "env");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI provider keys</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            Ranked list of LLM credentials. Every AI call (Ask AI, receipt
            OCR, visual item identifier) walks this list top-to-bottom.
            Free tiers (Gemini, Groq, etc.) fire first; the paid Anthropic
            key is the last-resort backstop. Quotas reset daily and the
            chain self-heals.
          </p>
        </CardHeader>
        <CardContent>
          <AiKeyManager
            rows={masked}
            supportedProviders={Array.from(SUPPORTED_PROVIDERS) as string[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Env-backed fallback</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            Keys configured via environment variables (
            <code>.env</code> locally, Railway Variables in prod). Tried
            after every DB-managed key above. Edit by changing the env
            var, not here.
          </p>
        </CardHeader>
        <CardContent>
          {envProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No env-backed providers detected.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {envProviders.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{p.name}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {p.providerSlug}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
