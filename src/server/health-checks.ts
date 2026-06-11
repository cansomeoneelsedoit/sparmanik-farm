import { prisma } from "@/server/prisma";

/**
 * Health check primitives. Each check runs a query against the DB,
 * returns a normalised result so the UI can render a uniform card per
 * issue, with optional AI-powered fix suggestions.
 *
 * Adding a new check is intentionally low-ceremony: write a function
 * that returns `HealthCheckResult`, then surface it from `runHealthChecks`.
 */

export type HealthSeverity = "critical" | "warn" | "info";

export type HealthIssueItem = {
  id: string;
  /** Short label shown in the row — e.g. an item name or code. */
  label: string;
  /** Optional supplementary text — current value, last activity, etc. */
  detail?: string | null;
  /** Optional deep-link so the user can jump to the affected record. */
  href?: string;
};

export type HealthCheckResult = {
  /** Stable identifier for the check (used by the UI as a React key, and
   * by AI-suggest actions to know which kind of fix to draft). */
  id: string;
  title: string;
  /** One-liner explaining why this matters operationally. */
  description: string;
  /** Severity tints the card border + status pill. */
  severity: HealthSeverity;
  /** Total count of affected records. */
  count: number;
  /** Up to 50 sample items for the inline list. */
  items: HealthIssueItem[];
  /** "Item · Category" — what fields the AI suggester would touch. */
  fixWith: string | null;
  /** True if the check has zero issues — keeps the UI's "All clear" state simple. */
  clean: boolean;
  /** Optional bulk-fix deep link rendered as a button on the card —
   * e.g. "open the stock-take wizard pre-filtered to these items". */
  actionHref?: string;
  actionLabel?: string;
};

/** Items in the org that have no category set — usually legacy seeds. */
async function checkUncategorisedItems(): Promise<HealthCheckResult> {
  const rows = await prisma.item.findMany({
    where: { categoryId: null },
    orderBy: { code: "asc" },
    take: 50,
    select: { id: true, code: true, name: true, description: true },
  });
  const count = await prisma.item.count({ where: { categoryId: null } });
  return {
    id: "uncategorised-items",
    title: "Items without a category",
    description:
      "Categorising helps the inventory filter chips work, and the dashboard's value-by-category pie chart depends on it. AI can suggest a category from the item name + description.",
    severity: count > 0 ? "warn" : "info",
    count,
    items: (rows as { id: string; code: string; name: string; description: string | null }[]).map(
      (r) => ({
        id: r.id,
        label: r.name?.trim() || "Untitled item",
        detail: `${r.code}${r.description ? ` · ${r.description.slice(0, 80)}` : ""}`,
        href: `/inventory/${r.id}`,
      }),
    ),
    fixWith: "categoryId",
    clean: count === 0,
  };
}

/** Items with an empty / whitespace-only name — almost always seed dregs. */
async function checkUnnamedItems(): Promise<HealthCheckResult> {
  // Empty-name detection has to come from raw SQL because Prisma's
  // string filters don't expose "is whitespace-only".
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT id, code, description
      FROM items
     WHERE COALESCE(TRIM(name), '') = ''
     ORDER BY code ASC
     LIMIT 50
  `)) as { id: string; code: string; description: string | null }[];
  const totalRow = (await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n
      FROM items
     WHERE COALESCE(TRIM(name), '') = ''
  `)) as { n: number }[];
  const count = totalRow[0]?.n ?? 0;
  return {
    id: "unnamed-items",
    title: "Items with no name",
    description:
      "Untitled stock entries show up as 'Untitled item' across the app. AI can suggest a name from the description (when present); otherwise rename inline.",
    severity: count > 0 ? "critical" : "info",
    count,
    items: rows.map((r) => ({
      id: r.id,
      label: r.code,
      detail: r.description ? r.description.slice(0, 120) : "no description either",
      href: `/inventory/${r.id}`,
    })),
    fixWith: "name",
    clean: count === 0,
  };
}

/** Items with no description — the AI uses these to suggest categories. */
async function checkItemsWithoutDescription(): Promise<HealthCheckResult> {
  const rows = await prisma.item.findMany({
    where: { description: null, NOT: { name: "" } },
    orderBy: { code: "asc" },
    take: 50,
    select: { id: true, code: true, name: true, category: { select: { name: true } } },
  });
  const count = await prisma.item.count({
    where: { description: null, NOT: { name: "" } },
  });
  return {
    id: "items-without-description",
    title: "Items without a description",
    description:
      "A one-line description lets the visual identifier (camera) match items more accurately. AI can draft one from the name.",
    severity: "info",
    count,
    items: (rows as { id: string; code: string; name: string; category: { name: string } | null }[]).map(
      (r) => ({
        id: r.id,
        label: r.name,
        detail: `${r.code}${r.category ? ` · ${r.category.name}` : ""}`,
        href: `/inventory/${r.id}`,
      }),
    ),
    fixWith: "description",
    clean: count === 0,
  };
}

/** Items with no photo and no description — hardest to identify visually. */
async function checkItemsWithoutPhoto(): Promise<HealthCheckResult> {
  // Photos can live in the DB (photo_data, post-blob-migration) OR on
  // disk (legacy photo_path). "No photo" = neither is set.
  const rows = await prisma.item.findMany({
    where: { photoPath: null, photoData: null, NOT: { name: "" } },
    orderBy: { code: "asc" },
    take: 50,
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category: { select: { name: true } },
    },
  });
  const count = await prisma.item.count({
    where: { photoPath: null, photoData: null, NOT: { name: "" } },
  });
  return {
    id: "items-without-photo",
    title: "Items without a photo",
    description:
      "Photos make the inventory list scannable and feed the visual identifier. Tap an item, upload a snap.",
    severity: "info",
    count,
    items: (rows as {
      id: string;
      code: string;
      name: string;
      description: string | null;
      category: { name: string } | null;
    }[]).map((r) => ({
      id: r.id,
      label: r.name,
      detail: `${r.code}${r.category ? ` · ${r.category.name}` : ""}`,
      href: `/inventory/${r.id}`,
    })),
    fixWith: null,
    clean: count === 0,
  };
}

/** Items where the reusable flag looks wrong — heuristic based on name. */
async function checkPossiblyMisflaggedReusable(): Promise<HealthCheckResult> {
  // Names that scream "reusable asset" (rockwool, dripper, frame, sensor,
  // tray, bucket, vibrator) currently marked reusable=false → suspicious.
  const REUSABLE_HINTS = [
    "rockwool",
    "cocopeat",
    "grow bag",
    "tray",
    "dripper",
    "frame",
    "sensor",
    "bucket",
    "pruner",
    "scissor",
    "knife",
    "vibrator",
    "tank",
    "pump",
    "hose",
    "valve",
    "pipe",
  ];
  // Names that are obviously consumables (seeds, fertiliser, nutrient
  // mix) currently marked reusable=true → also suspicious.
  const CONSUMABLE_HINTS = [
    "seed",
    "fertiliser",
    "fertilizer",
    "nutrient",
    "pesticide",
    "fungicide",
    "spray",
    "concentrate",
    "additive",
  ];

  const items = (await prisma.item.findMany({
    select: { id: true, code: true, name: true, reusable: true },
  })) as { id: string; code: string; name: string; reusable: boolean }[];
  const suspects = items.filter((it) => {
    const n = it.name.toLowerCase();
    const looksReusable = REUSABLE_HINTS.some((h) => n.includes(h));
    const looksConsumable = CONSUMABLE_HINTS.some((h) => n.includes(h));
    return (looksReusable && !it.reusable) || (looksConsumable && it.reusable);
  });
  return {
    id: "misflagged-reusable",
    title: "Items where the reusable flag might be wrong",
    description:
      "Reusable items get amortised across harvests (rockwool roll = 4 uses → 1/4 cost per harvest). Mis-flagged items either over-bill one harvest or skip the depreciation entirely.",
    severity: suspects.length > 0 ? "warn" : "info",
    count: suspects.length,
    items: suspects.slice(0, 50).map((r) => ({
      id: r.id,
      label: r.name,
      detail: `${r.code} · currently ${r.reusable ? "reusable" : "consumable"}`,
      href: `/inventory/${r.id}`,
    })),
    fixWith: "reusable",
    clean: suspects.length === 0,
  };
}

/** Live harvests that haven't moved in months — probably forgotten "End harvest". */
async function checkStaleLiveHarvests(): Promise<HealthCheckResult> {
  const SIX_MONTHS_AGO = new Date();
  SIX_MONTHS_AGO.setMonth(SIX_MONTHS_AGO.getMonth() - 6);
  const rows = await prisma.harvest.findMany({
    where: { status: "LIVE", startDate: { lte: SIX_MONTHS_AGO } },
    orderBy: { startDate: "asc" },
    take: 50,
    select: {
      id: true,
      name: true,
      startDate: true,
      greenhouse: { select: { name: true } },
    },
  });
  return {
    id: "stale-live-harvests",
    title: "Live harvests older than 6 months",
    description:
      "If a harvest has truly ended, hit 'End harvest' — that runs the reusable check-in flow and frees up the greenhouse for the next cycle. Forgotten LIVE harvests inflate the dashboard's 'active harvests' count.",
    severity: rows.length > 0 ? "warn" : "info",
    count: rows.length,
    items: (rows as {
      id: string;
      name: string;
      startDate: Date;
      greenhouse: { name: string };
    }[]).map((r) => ({
      id: r.id,
      label: r.name,
      detail: `${r.greenhouse.name} · started ${r.startDate.toISOString().slice(0, 10)}`,
      href: `/harvest/${r.id}`,
    })),
    fixWith: null,
    clean: rows.length === 0,
  };
}

/** Suppliers no contacts. */
async function checkSuppliersWithoutContact(): Promise<HealthCheckResult> {
  const rows = await prisma.supplier.findMany({
    where: { AND: [{ phone: null }, { email: null }] },
    orderBy: { name: "asc" },
    take: 50,
    select: { id: true, name: true, notes: true },
  });
  const count = await prisma.supplier.count({
    where: { AND: [{ phone: null }, { email: null }] },
  });
  return {
    id: "suppliers-without-contact",
    title: "Suppliers with no phone or email",
    description:
      "When you need to reorder urgently and there's no contact info, that's a problem. Add at least one channel per supplier.",
    severity: "info",
    count,
    items: (rows as { id: string; name: string; notes: string | null }[]).map((r) => ({
      id: r.id,
      label: r.name,
      detail: r.notes?.slice(0, 80) ?? null,
      href: `/suppliers/${r.id}`,
    })),
    fixWith: null,
    clean: count === 0,
  };
}

/** Staff with no hourly rate set. */
async function checkStaffWithoutRate(): Promise<HealthCheckResult> {
  const all = (await prisma.staff.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      rates: { take: 1, select: { rate: true } },
    },
  })) as { id: string; name: string; role: string | null; rates: { rate: unknown }[] }[];
  const missing = all.filter((s) => s.rates.length === 0);
  return {
    id: "staff-without-rate",
    title: "Staff with no hourly rate",
    description:
      "Labour cost on harvest P&L only gets calculated when a rate is set. Add a rate (even a placeholder) to keep the financials accurate.",
    severity: missing.length > 0 ? "warn" : "info",
    count: missing.length,
    items: missing.slice(0, 50).map((r) => ({
      id: r.id,
      label: r.name,
      detail: r.role ?? "no role set",
      href: `/staff`,
    })),
    fixWith: null,
    clean: missing.length === 0,
  };
}

/** Expenses without a category — make the financials harder to read. */
async function checkExpensesWithoutCategory(): Promise<HealthCheckResult> {
  const rows = await prisma.expense.findMany({
    where: { category: null },
    orderBy: { date: "desc" },
    take: 50,
    select: { id: true, date: true, payee: true, amount: true },
  });
  const count = await prisma.expense.count({ where: { category: null } });
  return {
    id: "expenses-without-category",
    title: "Expenses without a category",
    description:
      "Categories make the Financials roll-up readable. AI can suggest one from the payee + description.",
    severity: "info",
    count,
    items: (rows as { id: string; date: Date; payee: string; amount: unknown }[]).map(
      (r) => ({
        id: r.id,
        label: r.payee,
        detail: `${r.date.toISOString().slice(0, 10)} · ${r.amount}`,
        href: `/expenses`,
      }),
    ),
    fixWith: "category",
    clean: count === 0,
  };
}

/** Categories that have only ever held a single item — likely over-fragmented. */
async function checkSingletonCategories(): Promise<HealthCheckResult> {
  const cats = (await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { items: true } } },
  })) as { id: string; name: string; _count: { items: number } }[];
  const singletons = cats.filter((c) => c._count.items === 1);
  return {
    id: "singleton-categories",
    title: "Categories with only one item",
    description:
      "A category with one item is often a typo of an existing one — merge into the matching category to keep the filter chip list short.",
    severity: "info",
    count: singletons.length,
    items: singletons.slice(0, 50).map((c) => ({
      id: c.id,
      label: c.name,
      detail: "1 item",
      href: `/settings/categories`,
    })),
    fixWith: null,
    clean: singletons.length === 0,
  };
}

/**
 * Run every check in parallel and return a snapshot. The UI groups results
 * by severity — clean checks collapse into a green "All clear" summary
 * row at the top of the page.
 */
export async function runHealthChecks(): Promise<HealthCheckResult[]> {
  return Promise.all([
    checkUnnamedItems(),
    checkUncategorisedItems(),
    checkItemsWithoutDescription(),
    checkItemsWithoutPhoto(),
    checkPossiblyMisflaggedReusable(),
    checkLikelyPacksMissingPackInfo(),
    checkStaleLiveHarvests(),
    checkSuppliersWithoutContact(),
    checkStaffWithoutRate(),
    checkExpensesWithoutCategory(),
    checkSingletonCategories(),
  ]);
}

/**
 * Items whose NAME strongly suggests they're a pack (rol, meter, isi N gr,
 * benih, X pcs, etc.) but `sub_factor` is still NULL — meaning the system
 * doesn't know how many sub-units fit in one "unit". Without pack info, a
 * 100 m roll of drip pipe gets installed as "1 pc" instead of "30 metres"
 * and cost can't be apportioned correctly.
 *
 * Pattern hits:
 *   - rol / roll / meter / m)  → length-based packs (drip pipe, hoses)
 *   - benih / seed / biji / gram / isi N  → seed packets and chemical packs
 *   - polybag / polly / pack / isi N pcs  → discrete-count packs
 *
 * The fix path is the existing stock-take wizard — already has the toggle
 * to set sub_unit + sub_factor.
 */
async function checkLikelyPacksMissingPackInfo(): Promise<HealthCheckResult> {
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT id, code, name, unit
      FROM items
     WHERE sub_factor IS NULL
       AND (
         name ~* 'benih|seed\\b|biji|isi\\s*\\d+|gram\\b'
         OR name ~* 'rol\\s|roll\\s|meter\\)|\\sm\\)|^[0-9]+\\s*m\\s|per\\s+meter'
         OR name ~* 'polybag|polly|kantong'
         OR name ~* '\\d+\\s*pcs|\\d+\\s*pieces'
       )
     ORDER BY code ASC
     LIMIT 50
  `)) as { id: string; code: string; name: string; unit: string }[];
  const totalRow = (await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n
      FROM items
     WHERE sub_factor IS NULL
       AND (
         name ~* 'benih|seed\\b|biji|isi\\s*\\d+|gram\\b'
         OR name ~* 'rol\\s|roll\\s|meter\\)|\\sm\\)|^[0-9]+\\s*m\\s|per\\s+meter'
         OR name ~* 'polybag|polly|kantong'
         OR name ~* '\\d+\\s*pcs|\\d+\\s*pieces'
       )
  `)) as { n: number }[];
  const count = totalRow[0]?.n ?? 0;
  return {
    id: "missing-pack-info",
    title: "Likely packs missing pack info",
    description:
      "Items whose name says 'roll', 'meter', 'isi 500', 'benih', 'pcs', etc., but the system doesn't know how many sub-units fit in one pack. Without it, a 100 m roll installs as '1 pc' instead of '30 metres'. The button below opens the stock-take wizard filtered to every item still missing pack info — set the sub-unit and pack size inline, row by row.",
    severity: count > 0 ? "warn" : "info",
    count,
    items: rows.map((r) => ({
      id: r.id,
      label: r.code,
      detail: `${r.name.slice(0, 80)} · currently "${r.unit}"`,
      href: `/inventory/${r.id}`,
    })),
    fixWith: "name",
    clean: count === 0,
    actionHref: "/health-check/stocktake?focus=packinfo",
    actionLabel: "Fix inline in the stock-take wizard",
  };
}

/**
 * Aggregate score: percentage of checks that came back clean. The UI
 * surfaces this as the top-level "Farm data health" gauge so the user
 * sees progress as issues get cleaned up.
 */
export function computeHealthScore(checks: HealthCheckResult[]): {
  score: number;
  cleanCount: number;
  totalCount: number;
} {
  const cleanCount = checks.filter((c) => c.clean).length;
  const totalCount = checks.length;
  const score = totalCount > 0 ? Math.round((cleanCount / totalCount) * 100) : 100;
  return { score, cleanCount, totalCount };
}
