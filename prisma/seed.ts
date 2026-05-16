import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------- Legacy data extraction ----------

type LegacyItem = {
  id: number;
  name: string;
  cat: string;
  unit: string;
  subUnit?: string;
  subFactor?: number;
  location: string;
  reusable: boolean;
  reorder: number;
  shopeeUrl: string;
  defaultSupplier: string;
  batches: { id: number; date: string; supplier: string; qty: number; remaining: number; price: number; exchangeRate: number }[];
};
type LegacySupplier = { id: number; name: string; phone: string; email: string; notes: string; shopUrl: string };
type LegacyStaff = { id: number; name: string; role: string; rates: { rate: number; from: string }[]; avatar: string; photo: string };
type LegacyGreenhouse = { id: number; name: string };
type LegacyProduce = { id: number; name: string; barcode: string };
type LegacyHarvest = {
  id: number;
  ghId: number;
  name: string;
  variety: string;
  startDate: string;
  endDate: string | null;
  status: "live" | "closed";
  assets: { itemId: number; itemName: string; qty: number; fifo_cost: number; date: string; reusable: boolean; condition: string }[];
  usage: { itemId: number; itemName: string; qty: number; displayQty: string; fifo_cost: number; date: string }[];
  sales: { date: string; produceId: number; grade: "A" | "B" | "C" | "D"; weight: number; weightUnit: string; pricePerKg: number; amount: number }[];
};
type LegacyWageEntry = {
  id: number;
  staffId: number;
  date: string;
  totalHours: number;
  lines: { harvestId: number | null; ghId: number | null; hours: number; task: string }[];
};
type LegacyTask = {
  id: number;
  title: string;
  assignee: string;
  dueDate: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
  harvestId: number | null;
  notes: string;
  description: string;
  instructions: string;
  comments: { id: number; author: string; text: string; date: string; role: "admin" | "staff" }[];
  photos: string[];
};
type LegacyRecipe = {
  id: number;
  name: string;
  crop: string;
  stage: string;
  ec: number;
  ph: string;
  notes: string;
  ingredients: { name: string; amount: string }[];
};
type LegacySop = {
  id: number;
  title: string;
  titleId: string;
  category: string;
  description: string;
  descriptionId: string;
  version: number;
  status: "active" | "archived";
  coverPhoto: string;
  steps: string[];
  stepsId: string[];
};
type LegacyVideo = {
  id: number;
  title: string;
  titleId: string;
  category: string;
  duration: string;
  type: "youtube" | "upload";
  url: string;
  thumbnail: string;
};

type LegacyS = {
  items: LegacyItem[];
  suppliers: LegacySupplier[];
  staff: LegacyStaff[];
  greenhouses: LegacyGreenhouse[];
  produce: LegacyProduce[];
  harvests: LegacyHarvest[];
  wageEntries: LegacyWageEntry[];
  tasks: LegacyTask[];
  nutrientRecipes: LegacyRecipe[];
  sops: LegacySop[];
  videos: LegacyVideo[];
  categories: string[];
};

function loadLegacy(): LegacyS | null {
  const candidates = [
    path.join(process.cwd(), "public", "farm-legacy.js"),
    path.join(__dirname, "..", "public", "farm-legacy.js"),
  ];
  const legacyPath = candidates.find((p) => existsSync(p));
  if (!legacyPath) {
    console.warn("[seed] farm-legacy.js not found — skipping legacy import");
    return null;
  }
  const raw = readFileSync(legacyPath, "utf-8");
  const src = raw.replace(/\r\n/g, "\n");
  const start = src.indexOf("var S = {");
  if (start < 0) return null;
  const close = src.indexOf("\n};\n", start);
  if (close < 0) return null;
  const objSrc = src.slice(start + "var S = ".length, close + 2);
  const result = runInNewContext(`(${objSrc.replace(/;$/, "")})`, {}, { timeout: 5000 });
  return result as LegacyS;
}

// ---------- Helpers ----------

const D = (n: number | string) => new Decimal(n);
const date = (s: string) => new Date(s + "T00:00:00Z");

const statusMap = {
  live: "LIVE" as const,
  closed: "CLOSED" as const,
};
const taskStatusMap = {
  pending: "PENDING" as const,
  in_progress: "IN_PROGRESS" as const,
  completed: "COMPLETED" as const,
};
const taskPriorityMap = {
  high: "HIGH" as const,
  medium: "MEDIUM" as const,
  low: "LOW" as const,
};
const sopStatusMap = {
  active: "ACTIVE" as const,
  archived: "ARCHIVED" as const,
};
const videoTypeMap = {
  youtube: "YOUTUBE" as const,
  upload: "UPLOAD" as const,
};

async function main() {
  // ---- Singleton settings ----
  await prisma.setting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", farmName: "Sparmanik Farm", exchangeRate: D(10200), defaultLocale: "en" },
  });

  // ---- Dev user ----
  const devEmail = "dev@sparmanikfarm.local";
  const devPassword = "devpassword";
  const existingUser = await prisma.user.findUnique({ where: { email: devEmail } });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        email: devEmail,
        name: "Dev User",
        passwordHash: await bcrypt.hash(devPassword, 10),
      },
    });
    console.log(`[seed] Dev user: ${devEmail} / ${devPassword}`);
  }

  // ---- Categories (default set; legacy will overwrite with its own) ----
  const defaultCategories = ["Nutrients", "Media", "Pots", "Irrigation", "Seeds", "Pesticides", "Instruments", "Lighting", "Equipment", "Packaging", "Tools", "Other"];
  for (const name of defaultCategories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ---- Legacy import (idempotent: skip if already imported) ----
  const greenhouseCount = await prisma.greenhouse.count();
  if (greenhouseCount > 0) {
    console.log("[seed] Legacy data already imported — skipping");
    return;
  }

  const legacy = loadLegacy();
  if (!legacy) {
    console.log("[seed] No legacy data to import");
    return;
  }

  console.log("[seed] Importing legacy data…");

  // ---- Categories from legacy (just upsert any extras) ----
  for (const name of legacy.categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  const categoryIdByName = new Map<string, string>();
  for (const c of await prisma.category.findMany()) {
    categoryIdByName.set(c.name, c.id);
  }

  // ---- Greenhouses ----
  const ghIdByLegacyId = new Map<number, string>();
  for (const g of legacy.greenhouses) {
    const created = await prisma.greenhouse.create({ data: { name: g.name } });
    ghIdByLegacyId.set(g.id, created.id);
  }
  console.log(`[seed] ${legacy.greenhouses.length} greenhouses`);

  // ---- Produce ----
  const produceIdByLegacyId = new Map<number, string>();
  for (const p of legacy.produce) {
    const created = await prisma.produce.create({ data: { name: p.name, barcode: p.barcode || null } });
    produceIdByLegacyId.set(p.id, created.id);
  }
  console.log(`[seed] ${legacy.produce.length} produce`);

  // ---- Suppliers ----
  const supplierIdByLegacyId = new Map<number, string>();
  const supplierIdByName = new Map<string, string>();
  for (const s of legacy.suppliers) {
    const created = await prisma.supplier.create({
      data: {
        name: s.name,
        phone: s.phone || null,
        email: s.email || null,
        notes: s.notes || null,
        shopUrl: s.shopUrl || null,
      },
    });
    supplierIdByLegacyId.set(s.id, created.id);
    supplierIdByName.set(s.name, created.id);
  }
  console.log(`[seed] ${legacy.suppliers.length} suppliers`);

  // ---- Staff + StaffRate ----
  const staffIdByLegacyId = new Map<number, string>();
  const staffIdByName = new Map<string, string>();
  for (const st of legacy.staff) {
    const created = await prisma.staff.create({
      data: {
        name: st.name,
        role: st.role || null,
        avatar: st.avatar || null,
        rates: {
          create: st.rates.map((r) => ({
            rate: D(r.rate),
            effectiveFrom: date(r.from),
          })),
        },
      },
    });
    staffIdByLegacyId.set(st.id, created.id);
    staffIdByName.set(st.name, created.id);
  }
  console.log(`[seed] ${legacy.staff.length} staff (+ rates)`);

  // ---- Items + Batches ----
  const itemIdByLegacyId = new Map<number, string>();
  const batchIdByLegacyKey = new Map<string, string>(); // "itemId:legacyBatchId" → cuid
  for (const it of legacy.items) {
    const created = await prisma.item.create({
      data: {
        name: it.name,
        categoryId: categoryIdByName.get(it.cat) ?? null,
        unit: it.unit,
        subUnit: it.subUnit ?? null,
        subFactor: it.subFactor != null ? D(it.subFactor) : null,
        location: it.location || null,
        reusable: !!it.reusable,
        reorder: D(it.reorder ?? 0),
        shopeeUrl: it.shopeeUrl || null,
        defaultSupplierId: supplierIdByName.get(it.defaultSupplier) ?? null,
        batches: {
          create: it.batches.map((b) => ({
            date: date(b.date),
            supplierId: supplierIdByName.get(b.supplier) ?? null,
            qty: D(b.qty),
            price: D(b.price),
            exchangeRate: D(b.exchangeRate),
          })),
        },
      },
      include: { batches: true },
    });
    itemIdByLegacyId.set(it.id, created.id);
    // Pair created batches with legacy batch ids by date+qty order
    for (let i = 0; i < it.batches.length; i++) {
      batchIdByLegacyKey.set(`${it.id}:${it.batches[i].id}`, created.batches[i].id);
    }
  }
  console.log(`[seed] ${legacy.items.length} items + batches`);

  // ---- Harvests + their nested sales/usage/assets ----
  // Note: we don't have per-batch fifo breakdown for legacy usage/assets; we
  // create the parent records without BatchConsumption rows. Costs in the
  // legacy data (fifo_cost) are aggregate — preserved as `displayQty` text
  // where applicable but not as BatchConsumption rows.
  for (const h of legacy.harvests) {
    const ghId = ghIdByLegacyId.get(h.ghId);
    if (!ghId) continue;
    const harvest = await prisma.harvest.create({
      data: {
        greenhouseId: ghId,
        name: h.name,
        variety: h.variety || null,
        startDate: date(h.startDate),
        endDate: h.endDate ? date(h.endDate) : null,
        status: statusMap[h.status],
        sales: {
          create: h.sales.map((s) => ({
            produceId: produceIdByLegacyId.get(s.produceId) ?? Array.from(produceIdByLegacyId.values())[0],
            date: date(s.date),
            grade: s.grade,
            weight: D(s.weight),
            pricePerKg: D(s.pricePerKg),
            amount: D(s.amount),
          })),
        },
        usages: {
          create: h.usage
            .map((u) => {
              const itemId = itemIdByLegacyId.get(u.itemId);
              if (!itemId) return null;
              return {
                itemId,
                qty: D(u.qty),
                displayQty: u.displayQty || null,
                date: date(u.date),
              };
            })
            .filter((u): u is NonNullable<typeof u> => u !== null),
        },
        assets: {
          create: h.assets
            .map((a) => {
              const itemId = itemIdByLegacyId.get(a.itemId);
              if (!itemId) return null;
              return {
                itemId,
                qty: D(a.qty),
                date: date(a.date),
                reusable: !!a.reusable,
                condition: a.condition || null,
              };
            })
            .filter((a): a is NonNullable<typeof a> => a !== null),
        },
      },
    });
    void harvest;
  }
  console.log(`[seed] ${legacy.harvests.length} harvests (+ sales, usage, assets)`);

  // Track legacy → cuid map for wage entries & tasks
  const harvestIdByLegacyId = new Map<number, string>();
  for (const h of legacy.harvests) {
    const dbHarvest = await prisma.harvest.findFirst({
      where: { name: h.name, greenhouseId: ghIdByLegacyId.get(h.ghId)! },
    });
    if (dbHarvest) harvestIdByLegacyId.set(h.id, dbHarvest.id);
  }

  // ---- Wage entries ----
  for (const w of legacy.wageEntries) {
    const staffId = staffIdByLegacyId.get(w.staffId);
    if (!staffId) continue;
    await prisma.wageEntry.create({
      data: {
        staffId,
        date: date(w.date),
        totalHours: D(w.totalHours),
        lines: {
          create: w.lines.map((l) => ({
            hours: D(l.hours),
            task: l.task || null,
            harvestId: l.harvestId ? harvestIdByLegacyId.get(l.harvestId) ?? null : null,
            greenhouseId: l.ghId ? ghIdByLegacyId.get(l.ghId) ?? null : null,
          })),
        },
      },
    });
  }
  console.log(`[seed] ${legacy.wageEntries.length} wage entries`);

  // ---- Tasks ----
  for (const t of legacy.tasks) {
    await prisma.task.create({
      data: {
        title: t.title,
        assigneeStaffId: staffIdByName.get(t.assignee) ?? null,
        dueDate: date(t.dueDate),
        priority: taskPriorityMap[t.priority],
        status: taskStatusMap[t.status],
        harvestId: t.harvestId ? harvestIdByLegacyId.get(t.harvestId) ?? null : null,
        notes: t.notes || null,
        description: t.description || null,
        instructions: t.instructions || null,
        comments: {
          create: t.comments.map((c) => ({
            author: c.author,
            text: c.text,
            role: c.role === "admin" ? "ADMIN" : "STAFF",
          })),
        },
      },
    });
  }
  console.log(`[seed] ${legacy.tasks.length} tasks`);

  // ---- Nutrient recipes ----
  for (const r of legacy.nutrientRecipes) {
    await prisma.nutrientRecipe.create({
      data: {
        name: r.name,
        crop: r.crop || null,
        stage: r.stage || null,
        ec: r.ec != null ? D(r.ec) : null,
        ph: r.ph || null,
        notes: r.notes || null,
        ingredients: { create: r.ingredients.map((i) => ({ name: i.name, amount: i.amount })) },
      },
    });
  }
  console.log(`[seed] ${legacy.nutrientRecipes.length} recipes`);

  // ---- SOPs ----
  for (const s of legacy.sops) {
    await prisma.sop.create({
      data: {
        titleEn: s.title,
        titleId: s.titleId,
        descriptionEn: s.description || null,
        descriptionId: s.descriptionId || null,
        category: s.category || null,
        version: s.version,
        status: sopStatusMap[s.status],
        steps: {
          create: s.steps.map((bodyEn, i) => ({
            position: i,
            bodyEn,
            bodyId: s.stepsId[i] ?? bodyEn,
          })),
        },
      },
    });
  }
  console.log(`[seed] ${legacy.sops.length} SOPs`);

  // ---- Videos ----
  for (const v of legacy.videos) {
    function parseYoutubeId(url: string): string | null {
      const m1 = url.match(/youtu\.be\/([\w-]{11})/);
      if (m1) return m1[1];
      const m2 = url.match(/[?&]v=([\w-]{11})/);
      return m2 ? m2[1] : null;
    }
    const ytId = v.type === "youtube" ? parseYoutubeId(v.url) : null;
    await prisma.video.create({
      data: {
        titleEn: v.title,
        titleId: v.titleId,
        category: v.category || null,
        duration: v.duration || null,
        type: videoTypeMap[v.type],
        url: v.url || null,
        thumbnailPath: ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : null,
      },
    });
  }
  console.log(`[seed] ${legacy.videos.length} videos`);

  console.log("[seed] Legacy import complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
