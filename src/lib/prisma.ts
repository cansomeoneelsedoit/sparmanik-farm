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
  "Customer",
  "Item",
  "Batch",
  "Staff",
  "Harvest",
  "HarvestAsset",
  "HarvestUsage",
  "Sale",
  "HarvestDisposition",
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
  "StockSale",
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
type ActiveContext = { orgId: string | null; authenticated: boolean };

const resolveActiveContext = cache(
  async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    basePrisma: any,
  ): Promise<ActiveContext> => {
    try {
      // Dynamic import keeps next/headers out of seed/CLI bundles.
      // cookies() throws if called outside a request context; we catch
      // and return an unauthenticated context (seed/CLI).
      const mod = await import("next/headers");
      const c = await mod.cookies();
      const raw = c.get("activeOrgId")?.value;
      const { auth } = await import("@/auth");
      const session = await auth();
      if (!session?.user?.id) return { orgId: null, authenticated: false };
      // A SUPERUSER (owner) may act in ANY farm; a regular user only in farms
      // they're a member of.
      const isSuper = (session.user as { role?: string }).role === "SUPERUSER";
      if (raw) {
        if (isSuper) {
          // Owner: honour the cookie whenever it names a real org.
          const org = await basePrisma.organization.findUnique({
            where: { id: raw },
            select: { id: true },
          });
          if (org) return { orgId: org.id, authenticated: true };
        } else {
          // Regular user: the cookie's org must be one they belong to, else a
          // stale cookie would scope every query to a foreign org and pages
          // would 404. Fall through to their first membership otherwise.
          const membership = await basePrisma.organizationMembership.findUnique({
            where: {
              userId_organizationId: { userId: session.user.id, organizationId: raw },
            },
            select: { organizationId: true },
          });
          if (membership) return { orgId: membership.organizationId, authenticated: true };
        }
      }
      // No usable cookie — fall back to the user's first membership.
      const m = await basePrisma.organizationMembership.findFirst({
        where: { userId: session.user.id },
        orderBy: { joinedAt: "asc" },
        select: { organizationId: true },
      });
      if (m?.organizationId) return { orgId: m.organizationId, authenticated: true };

      // Still nothing. A SUPERUSER manages every farm, so default them to the
      // PRIMARY org (most members, ties broken by oldest) — they switch farms
      // via the cookie above. A regular user with no membership returns null,
      // and the create-guard surfaces a clear "no active organisation" message
      // instead of orphaning a row / crashing on the NOT NULL column.
      if (isSuper) {
        type OrgRow = { id: string; createdAt: Date; _count: { memberships: number } };
        const orgs = (await basePrisma.organization.findMany({
          select: { id: true, createdAt: true, _count: { select: { memberships: true } } },
        })) as OrgRow[];
        if (orgs.length > 0) {
          orgs.sort((a: OrgRow, b: OrgRow) => {
            const byMembers = (b._count?.memberships ?? 0) - (a._count?.memberships ?? 0);
            if (byMembers !== 0) return byMembers;
            return a.createdAt.getTime() - b.createdAt.getTime();
          });
          return { orgId: orgs[0].id, authenticated: true };
        }
      }
      // Authenticated, but no org could be resolved (a user with zero
      // memberships). The extension fails CLOSED for this case.
      return { orgId: null, authenticated: true };
    } catch {
      return { orgId: null, authenticated: false };
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
          const { orgId, authenticated } = await resolveActiveContext(base);

          if (!orgId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = args as any;
            if (authenticated) {
              // A signed-in request whose org can't be resolved (a user with no
              // membership). FAIL CLOSED — never run a scoped query unscoped, or
              // this user would see and mutate every farm's data. Reads and
              // where-writes get an impossible org filter (→ empty / no-op);
              // creates/upserts are refused with a clear message.
              if (operation === "create" || operation === "createMany" || operation === "upsert") {
                throw new Error(
                  "No active organisation for your account. Please sign out and sign back in, then try again.",
                );
              }
              if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
                a.where = { ...(a.where ?? {}), organizationId: "__no_active_org__" };
              }
              return query(args);
            }
            // Non-request context (seed / migration / build). Explicitly-scoped
            // writes pass through; an unscoped create would orphan the row and
            // crash on the NOT NULL organization_id column — refuse it clearly.
            const ad = a?.data;
            const hasExplicitOrg =
              operation === "create"
                ? ad?.organizationId != null
                : operation === "createMany" && Array.isArray(ad)
                  ? ad.every((row: Record<string, unknown>) => row?.organizationId != null)
                  : true;
            if ((operation === "create" || operation === "createMany") && !hasExplicitOrg) {
              throw new Error(
                "No active organisation in this context — set organizationId explicitly (seed/CLI).",
              );
            }
            return query(args);
          }

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
          // upsert can also insert — stamp its create payload too so an insert
          // via upsert can't land in the wrong (or no) org.
          if (operation === "upsert") {
            a.create = { organizationId: orgId, ...(a.create ?? {}) };
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
