import { PrismaClient } from "@prisma/client";

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

const CREATE_OPS = new Set(["create", "createMany"]);

/**
 * Read the active organisation id from the request cookie. Returns null in
 * non-request contexts (seed, CLI scripts) so those paths skip scoping and
 * can write to any org explicitly.
 */
async function getActiveOrgIdFromCookie(): Promise<string | null> {
  try {
    // Dynamic import keeps next/headers out of seed/CLI bundles. cookies()
    // throws if called outside a request context; we catch and return null.
    const mod = await import("next/headers");
    const c = await mod.cookies();
    return c.get("activeOrgId")?.value ?? null;
  } catch {
    return null;
  }
}

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!ORG_SCOPED_MODELS.has(model)) return query(args);
          const orgId = await getActiveOrgIdFromCookie();
          // Non-request context (seed / build): pass through. The caller in
          // those contexts is expected to set organizationId explicitly.
          if (!orgId) return query(args);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = args as any;
          if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), organizationId: orgId };
          }
          if (operation === "create") {
            a.data = { ...(a.data ?? {}), organizationId: orgId };
          }
          if (operation === "createMany" && Array.isArray(a.data)) {
            a.data = a.data.map((row: Record<string, unknown>) => ({ ...row, organizationId: orgId }));
          }
          return query(args);
        },
      },
    },
  });
}

// Helper for the "I need to override the cookie inside a single request"
// case (e.g. cross-org lookups for superusers in /admin/users). The
// extension still picks the cookie up unless callers explicitly call this
// without a cookie set — for now we don't ship a bypass.

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
