import { PrismaClient } from "@prisma/client";
import { cache } from "react";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Models that carry an `organizationId` column. Queries against these get
 * auto-scoped by the active organisation from the cookie; creates get
 * auto-stamped. Other models (lookup tables like ExchangeRateHistory, child
 * tables that go through a scoped parent, Auth.js tables) are left alone.
 */
const ORG_SCOPED_MODELS = new Set([
  "Category",
  "Produce",
  "Greenhouse",
  "Supplier",
  "Item",
  "Batch",
  "Staff",
  "Harvest",
  "HarvestAsset",
  "HarvestUsage",
  "Sale",
  "Task",
  "NutrientRecipe",
  "Sop",
  "Video",
  "AuditAction",
  "AiConversation",
  "AiMessage",
  "Expense",
  "LabourTask",
  "AiProviderKey",
]);

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const WRITE_WHERE_OPS = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

/**
 * Resolve the active organisation id for the current request, validated
 * against the signed-in user's memberships. Returns null in non-request
 * contexts (seed, CLI) so those paths skip scoping and can write to any
 * org explicitly.
 *
 * **Wrapped in React's `cache()`** so it runs at most once per request,
 * even if 20 queries fire in parallel. The previous implementation hit
 * the DB twice per query (org lookup + membership lookup), so a single
 * dashboard render did ~40 redundant DB round-trips just to figure out
 * the user's org. This made the whole site feel laggy.
 */
const resolveActiveOrgId = cache(
  async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    basePrisma: any,
  ): Promise<string | null> => {
    try {
      // Dynamic import keeps next/headers out of seed/CLI bundles.
      // cookies() throws if called outside a request context; we catch
      // and return null.
      const mod = await import("next/headers");
      const c = await mod.cookies();
      const raw = c.get("activeOrgId")?.value;
      const { auth } = await import("@/auth");
      const session = await auth();
      if (!session?.user?.id) return null;
      if (raw) {
        // CRITICAL: a cookie's org must be one the current user is
        // actually a member of. Otherwise (e.g. dev@ logged in with
        // cookie=org_andre, signed out, then a different user signed in)
        // we'd scope every query to a foreign org and findUnique calls
        // would all return null and pages 404. Fall through to the
        // membership fallback below.
        const membership = await basePrisma.organizationMembership.findUnique(
          {
            where: {
              userId_organizationId: {
                userId: session.user.id,
                organizationId: raw,
              },
            },
            select: { organizationId: true },
          },
        );
        if (membership) return membership.organizationId;
      }
      // Cookie missing, invalid, or pointed at an org the user isn't in
      // — fall back to the user's first membership.
      const m = await basePrisma.organizationMembership.findFirst({
        where: { userId: session.user.id },
        orderBy: { joinedAt: "asc" },
        select: { organizationId: true },
      });
      return m?.organizationId ?? null;
    } catch {
      return null;
    }
  },
);

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!ORG_SCOPED_MODELS.has(model)) return query(args);
          const orgId = await resolveActiveOrgId(base);
          // Non-request context (seed / build) OR invalid/missing cookie:
          // pass through. Callers in those contexts are expected to set
          // organizationId explicitly.
          if (!orgId) return query(args);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = args as any;
          if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), organizationId: orgId };
          }
          // Spread order matters: explicit organizationId on the caller's
          // data object wins, so call sites that have already validated
          // an org membership (e.g. via getActiveOrgId from @/server/org)
          // aren't overridden by a stale-but-valid-looking cookie.
          if (operation === "create") {
            a.data = { organizationId: orgId, ...(a.data ?? {}) };
          }
          if (operation === "createMany" && Array.isArray(a.data)) {
            a.data = a.data.map((row: Record<string, unknown>) => ({ organizationId: orgId, ...row }));
          }
          return query(args);
        },
      },
    },
  });
}

// Reusing the same client across hot reloads in dev avoids exhausting the
// connection pool. The cast keeps the extended client's inferred type
// available to callers (Prisma extension types are wider than PrismaClient).
export const prisma =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalForPrisma.prisma as any) ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalForPrisma.prisma = prisma as any;
}
