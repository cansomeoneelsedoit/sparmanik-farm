"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { recordAction } from "@/server/audit";
import { consumeFifo } from "@/server/fifo";
import { Decimal, type TransactionClient } from "@/server/decimal";
import { saveImageBuffer, saveImageUpload } from "@/server/uploads";
import { getActiveOrgId } from "@/server/org";

/**
 * Generate the next SF##### code for the active organisation. Walks the
 * existing items' codes, picks the highest numeric suffix, and adds one.
 * Done inside a transaction (caller's tx) so concurrent creates can't both
 * pick the same code — the unique index will reject the loser regardless,
 * but we also retry once before giving up to keep the UX seamless.
 */
export async function nextItemCode(tx: TransactionClient): Promise<string> {
  const orgId = await getActiveOrgId();
  const where = orgId ? { organizationId: orgId } : {};
  const top = await tx.item.findFirst({
    where,
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let next = 1;
  if (top?.code) {
    const m = top.code.match(/^SF(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `SF${String(next).padStart(5, "0")}`;
}

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function userId(): Promise<string | null> {
  const s = await auth();
  return s?.user?.id ?? null;
}

const newItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  photoPath: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  unit: z.string().min(1),
  subUnit: z.string().optional().nullable(),
  subFactor: z.string().optional().nullable(),
  productFamily: z.string().max(120).optional().nullable(),
  location: z.string().optional().nullable(),
  reusable: z.boolean().optional().default(false),
  reorder: z.string().default("0"),
  shopeeUrl: z.string().url().optional().or(z.literal("")).nullable(),
  defaultSupplierId: z.string().optional().nullable(),
});

/**
 * Upload an item photo. Reuses the existing sharp + WebP pipeline that the
 * Ask AI vision upload uses. Returns a relative `path` that the caller
 * stores on the Item (the `/api/uploads/[...path]` route serves it back).
 */
export async function uploadItemPhoto(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const s = await auth();
  if (!s?.user?.id) return { ok: false, error: "Not signed in" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  try {
    const saved = await saveImageUpload(file, "items");
    return { ok: true, data: { path: saved.path } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function createItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = newItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const uid = await userId();
  // Retry once if the auto-generated code races with another concurrent
  // create — extremely unlikely in practice but cheap to guard against.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const item = await prisma.$transaction(async (tx: TransactionClient) => {
        const code = await nextItemCode(tx);
        const created = await tx.item.create({
          data: {
            code,
            name: parsed.data.name,
            description: parsed.data.description || null,
            photoPath: parsed.data.photoPath || null,
            categoryId: parsed.data.categoryId || null,
            unit: parsed.data.unit,
            subUnit: parsed.data.subUnit || null,
            subFactor: parsed.data.subFactor ? new Decimal(parsed.data.subFactor) : null,
            productFamily: parsed.data.productFamily?.trim() || null,
            location: parsed.data.location || null,
            reusable: parsed.data.reusable ?? false,
            reorder: new Decimal(parsed.data.reorder),
            shopeeUrl: parsed.data.shopeeUrl || null,
            defaultSupplierId: parsed.data.defaultSupplierId || null,
          },
        });
        await recordAction(tx, {
          type: "item.create",
          entityType: "Item",
          entityId: created.id,
          description: `Added item: ${created.name} (${code})`,
          userId: uid,
          payload: { name: created.name, code },
        });
        return created;
      });
      revalidatePath("/inventory");
      return { ok: true, data: { id: item.id } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && msg.toLowerCase().includes("unique")) {
        // Race on the code — retry once with a fresh number.
        continue;
      }
      return { ok: false, error: msg };
    }
  }
  return { ok: false, error: "Couldn't allocate an item code" };
}

export async function updateItem(id: string, input: unknown): Promise<ActionResult> {
  const parsed = newItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  await prisma.item.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      photoPath: parsed.data.photoPath || null,
      categoryId: parsed.data.categoryId || null,
      unit: parsed.data.unit,
      subUnit: parsed.data.subUnit || null,
      subFactor: parsed.data.subFactor ? new Decimal(parsed.data.subFactor) : null,
      productFamily: parsed.data.productFamily?.trim() || null,
      location: parsed.data.location || null,
      reusable: parsed.data.reusable ?? false,
      reorder: new Decimal(parsed.data.reorder),
      shopeeUrl: parsed.data.shopeeUrl || null,
      defaultSupplierId: parsed.data.defaultSupplierId || null,
    },
  });
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  return { ok: true };
}

/**
 * Distinct list of product-family tags currently in use in this org. Drives
 * the autocomplete on the item edit dialog so the user doesn't accidentally
 * fragment the catalog with "Calnit" vs "calnit " vs "Meroke Calnit".
 */
export async function listProductFamilies(): Promise<
  ActionResult<{ name: string; itemCount: number }[]>
> {
  // Group-by hits the new composite index (organization_id, product_family).
  const rows = await prisma.item.groupBy({
    by: ["productFamily"],
    where: { productFamily: { not: null } },
    _count: { _all: true },
    orderBy: { productFamily: "asc" },
  });
  type Row = { productFamily: string | null; _count: { _all: number } };
  return {
    ok: true,
    data: (rows as Row[])
      .filter((r) => !!r.productFamily?.trim())
      .map((r) => ({ name: r.productFamily as string, itemCount: r._count._all })),
  };
}

/**
 * Roll up substance totals across every item that belongs to the same
 * product family. Each item contributes `on_hand_packs × subFactor` to the
 * family total. Items in the family that have no subFactor (e.g. count
 * units, "pcs") contribute their raw pack count.
 *
 * Returns one row per family, plus a per-item breakdown for the detail
 * panel.
 */
export async function getProductFamilyRollup(
  family: string,
): Promise<
  ActionResult<{
    family: string;
    items: Array<{
      id: string;
      code: string;
      name: string;
      unit: string;
      subUnit: string | null;
      subFactor: string | null;
      onHandPacks: string;
      onHandSubUnits: string;
    }>;
    totalSubUnits: string;
    subUnit: string | null;
    totalPacks: string;
  }>
> {
  if (!family.trim()) return { ok: false, error: "Family name required" };
  const items = await prisma.item.findMany({
    where: { productFamily: family.trim() },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      subUnit: true,
      subFactor: true,
      batches: {
        select: {
          qty: true,
          consumptions: { select: { qty: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  type ItemRow = {
    id: string;
    code: string;
    name: string;
    unit: string;
    subUnit: string | null;
    subFactor: Decimal | null;
    batches: { qty: Decimal; consumptions: { qty: Decimal }[] }[];
  };

  let totalSubUnits = new Decimal(0);
  let totalPacks = new Decimal(0);
  const subUnits = new Set<string>();
  const rows = (items as ItemRow[]).map((it) => {
    const stock = it.batches.reduce((s: Decimal, b) => {
      const consumed = b.consumptions.reduce(
        (cs: Decimal, c) => cs.plus(c.qty),
        new Decimal(0),
      );
      return s.plus(new Decimal(b.qty).minus(consumed));
    }, new Decimal(0));
    const subFactor = it.subFactor ? new Decimal(it.subFactor) : new Decimal(1);
    const subUnitQty = stock.times(subFactor);
    totalPacks = totalPacks.plus(stock);
    totalSubUnits = totalSubUnits.plus(subUnitQty);
    if (it.subUnit) subUnits.add(it.subUnit);
    return {
      id: it.id,
      code: it.code,
      name: it.name?.trim() || `(Untitled ${it.code})`,
      unit: it.unit,
      subUnit: it.subUnit,
      subFactor: it.subFactor ? new Decimal(it.subFactor).toString() : null,
      onHandPacks: stock.toFixed(2).replace(/\.?0+$/, ""),
      onHandSubUnits: subUnitQty.toFixed(2).replace(/\.?0+$/, ""),
    };
  });

  return {
    ok: true,
    data: {
      family: family.trim(),
      items: rows,
      totalSubUnits: totalSubUnits.toFixed(2).replace(/\.?0+$/, ""),
      // If every item in the family agrees on a single sub-unit, surface it
      // as THE family unit. Mixed sub-units (e.g. some items in kg, some in
      // L) come back as null and the UI shows the per-item breakdown only.
      subUnit: subUnits.size === 1 ? Array.from(subUnits)[0] : null,
      totalPacks: totalPacks.toFixed(2).replace(/\.?0+$/, ""),
    },
  };
}

export async function deleteBatch(id: string): Promise<ActionResult> {
  try {
    await prisma.batch.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Can't delete a batch that's been consumed by harvests" };
  }
  revalidatePath("/inventory");
  return { ok: true };
}

/**
 * Quick item creation for inline "+ Create new" flows (e.g. from the Receive
 * Stock multi-line page when staff types an item name that doesn't exist
 * yet). Minimal fields — defaults the unit to "pcs", no category, no
 * supplier; user can flesh it out later from the item detail page.
 */
export async function createItemQuick(
  name: string,
  unit: string = "pcs",
): Promise<ActionResult<{ id: string; name: string; unit: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };
  const uid = await userId();
  try {
    const item = await prisma.$transaction(async (tx: TransactionClient) => {
      const code = await nextItemCode(tx);
      const created = await tx.item.create({
        data: { code, name: trimmed, unit, reorder: new Decimal(0) },
      });
      await recordAction(tx, {
        type: "item.create",
        entityType: "Item",
        entityId: created.id,
        description: `Added item (quick): ${trimmed} (${code})`,
        userId: uid,
        payload: { name: trimmed, code, source: "quick" },
      });
      return created;
    });
    revalidatePath("/inventory");
    return { ok: true, data: { id: item.id, name: item.name, unit: item.unit } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create item",
    };
  }
}

/**
 * Quick supplier creation, used by the Receive Stock page's inline "+ Create"
 * affordance on the Supplier Combobox.
 */
export async function createSupplierQuick(
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };
  const uid = await userId();
  try {
    const sup = await prisma.$transaction(async (tx: TransactionClient) => {
      const created = await tx.supplier.create({ data: { name: trimmed } });
      await recordAction(tx, {
        type: "supplier.create",
        entityType: "Supplier",
        entityId: created.id,
        description: `Added supplier (quick): ${trimmed}`,
        userId: uid,
        payload: { name: trimmed, source: "quick" },
      });
      return created;
    });
    revalidatePath("/inventory");
    revalidatePath("/inventory/receive");
    revalidatePath("/suppliers");
    return { ok: true, data: { id: sup.id, name: sup.name } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create supplier",
    };
  }
}

const receiveStockSchema = z.object({
  itemId: z.string(),
  date: z.string(), // YYYY-MM-DD
  supplierId: z.string().optional().nullable(),
  qty: z.string(),
  price: z.string(),
  exchangeRate: z.string(),
  // maxUses=1 (default) means non-depreciable — existing behaviour preserved.
  // maxUses>1 enables depreciation: amortisedCostPerUse = price / maxUses,
  // locked at receive time, never recalculated for this batch.
  maxUses: z.coerce.number().int().min(1).default(1),
});

export async function receiveStock(input: unknown): Promise<ActionResult<{ batchId: string }>> {
  const parsed = receiveStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const uid = await userId();
  const price = new Decimal(parsed.data.price);
  const amortisedCostPerUse =
    parsed.data.maxUses > 1 ? price.div(parsed.data.maxUses) : null;
  const result = await prisma.$transaction(async (tx: TransactionClient) => {
    const batch = await tx.batch.create({
      data: {
        itemId: parsed.data.itemId,
        date: new Date(parsed.data.date),
        supplierId: parsed.data.supplierId || null,
        qty: new Decimal(parsed.data.qty),
        price,
        exchangeRate: new Decimal(parsed.data.exchangeRate),
        maxUses: parsed.data.maxUses,
        useCount: 0,
        amortisedCostPerUse: amortisedCostPerUse,
      },
      include: { item: { select: { name: true } } },
    });
    await recordAction(tx, {
      type: "inventory.receive_stock",
      entityType: "Batch",
      entityId: batch.id,
      description: `Received ${parsed.data.qty} of ${batch.item.name}`,
      userId: uid,
      payload: {
        batchId: batch.id,
        itemId: batch.itemId,
        qty: parsed.data.qty,
        maxUses: parsed.data.maxUses,
      },
    });
    return batch;
  });
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${parsed.data.itemId}`);
  return { ok: true, data: { batchId: result.id } };
}

// -----------------------------------------------------------------------------
// Multi-line "Receive Stock" — one supplier + date, several batches in one go
// -----------------------------------------------------------------------------

const receiveStockBulkSchema = z.object({
  date: z.string().min(1),
  supplierId: z.string().optional().nullable(),
  exchangeRate: z.string().default("1"),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.string().regex(/^[0-9.]+$/),
        price: z.string().regex(/^[0-9.]+$/),
        maxUses: z.coerce.number().int().min(1).default(1),
      }),
    )
    .min(1, "Add at least one line"),
});

export async function receiveStockBulk(
  input: unknown,
): Promise<ActionResult<{ batchIds: string[]; lineCount: number }>> {
  const parsed = receiveStockBulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const uid = await userId();
  const date = new Date(parsed.data.date);
  const exchangeRate = new Decimal(parsed.data.exchangeRate || "1");
  const supplierId = parsed.data.supplierId || null;

  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      const ids: string[] = [];
      const itemIdsToRevalidate = new Set<string>();
      for (const l of parsed.data.lines) {
        const price = new Decimal(l.price);
        const amortisedCostPerUse = l.maxUses > 1 ? price.div(l.maxUses) : null;
        const batch = await tx.batch.create({
          data: {
            itemId: l.itemId,
            date,
            supplierId,
            qty: new Decimal(l.qty),
            price,
            exchangeRate,
            maxUses: l.maxUses,
            useCount: 0,
            amortisedCostPerUse,
          },
          include: { item: { select: { name: true } } },
        });
        ids.push(batch.id);
        itemIdsToRevalidate.add(l.itemId);

        await recordAction(tx, {
          type: "inventory.receive_stock",
          entityType: "Batch",
          entityId: batch.id,
          description: `Received ${l.qty} of ${batch.item.name}`,
          userId: uid,
          payload: {
            batchId: batch.id,
            itemId: batch.itemId,
            qty: l.qty,
            maxUses: l.maxUses,
            bulk: true,
          },
        });
      }
      return { ids, itemIdsToRevalidate: Array.from(itemIdsToRevalidate) };
    });

    revalidatePath("/inventory");
    for (const id of result.itemIdsToRevalidate) revalidatePath(`/inventory/${id}`);
    return { ok: true, data: { batchIds: result.ids, lineCount: result.ids.length } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to receive stock" };
  }
}

const useStockSchema = z.object({
  itemId: z.string(),
  qty: z.string(),
});

export async function consumeItem(input: unknown): Promise<ActionResult<{ actionId: string }>> {
  const parsed = useStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const uid = await userId();
  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      const item = await tx.item.findUnique({ where: { id: parsed.data.itemId }, select: { name: true } });
      if (!item) throw new Error("Item not found");

      const { consumed, totalCost } = await consumeFifo(tx, parsed.data.itemId, parsed.data.qty);

      // Create a synthetic "ad-hoc usage" — for now, just BatchConsumption rows
      // not linked to a harvest. We model them by leaving harvestUsageId null
      // and using the audit payload to identify the group.
      const created: { id: string }[] = [];
      for (const c of consumed) {
        const row = await tx.batchConsumption.create({
          data: { batchId: c.batchId, qty: new Decimal(c.qty), unitCost: new Decimal(c.unitCost) },
        });
        created.push({ id: row.id });
      }

      const action = await recordAction(tx, {
        type: "inventory.use_stock",
        entityType: "Item",
        entityId: parsed.data.itemId,
        description: `Used ${parsed.data.qty} of ${item.name}`,
        userId: uid,
        payload: { itemId: parsed.data.itemId, qty: parsed.data.qty, totalCost, consumptionIds: created.map((c) => c.id) },
      });
      return action;
    });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${parsed.data.itemId}`);
    return { ok: true, data: { actionId: result.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to use stock" };
  }
}

// -----------------------------------------------------------------------------
// Excel bulk import
// -----------------------------------------------------------------------------

/**
 * Map a raw header from the user's spreadsheet to one of our known Item
 * fields. Returns null when nothing recognisable matched. Case- and
 * whitespace-insensitive so "Item Name" matches "item name", "Item_Name",
 * etc. Also strips currency markers like "(Rp)" so "Unit Price (Rp)" maps
 * to unitPrice.
 */
function matchHeader(raw: string): keyof ParsedItemRow | null {
  const k = raw
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // drop "(Rp)" etc.
    .replace(/[_\s-]+/g, "");
  const map: Record<string, keyof ParsedItemRow> = {
    name: "name",
    itemname: "name",
    productname: "name",
    item: "name",
    product: "name",
    title: "name",
    description: "description",
    desc: "description",
    notes: "description",
    details: "description",
    info: "description",
    variation: "variation",
    variant: "variation",
    colour: "variation",
    color: "variation",
    category: "categoryName",
    cat: "categoryName",
    type: "categoryName",
    unit: "unit",
    uom: "unit",
    units: "unit",
    measure: "unit",
    reorder: "reorder",
    reorderlevel: "reorder",
    reorderpoint: "reorder",
    reorderqty: "reorder",
    minstock: "reorder",
    qty: "qty",
    quantity: "qty",
    qtypurchased: "qty",
    pcs: "qty",
    count: "qty",
    unitprice: "unitPrice",
    price: "unitPrice",
    cost: "unitPrice",
    unitcost: "unitPrice",
    pricepaid: "unitPrice",
    supplier: "supplierName",
    defaultsupplier: "supplierName",
    vendor: "supplierName",
    shop: "supplierName",
    seller: "supplierName",
    location: "location",
    store: "location",
    warehouse: "location",
    reusable: "reusable",
    asset: "reusable",
    depreciable: "reusable",
    url: "shopeeUrl",
    shopee: "shopeeUrl",
    shopeeurl: "shopeeUrl",
    link: "shopeeUrl",
    producturl: "shopeeUrl",
  };
  return map[k] ?? null;
}

export type ParsedItemRow = {
  name: string;
  description: string | null;
  /** Appended to name when present so "Box 15cm" + "MERAH" → "Box 15cm — MERAH" */
  variation: string | null;
  categoryName: string | null;
  unit: string;
  reorder: string;
  supplierName: string | null;
  location: string | null;
  reusable: boolean;
  shopeeUrl: string | null;
  /** Optional: when present a Batch is created at import time */
  qty: string | null;
  unitPrice: string | null;
  /** Set by the image-extraction pass when a Picture is anchored to this row */
  photoPath: string | null;
};

export type ImportPreview = {
  totalRows: number;
  validRows: ParsedItemRow[];
  detectedHeaders: { raw: string; mapped: keyof ParsedItemRow | null }[];
  errors: { row: number; reason: string }[];
};

function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1" || s === "t";
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Strip thousand-separators / currency symbols so "Rp 3,750" / "3.750,00"
 * / "3750" all parse to 3750. Returns null when nothing numeric was found. */
function parseNumberLoose(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const raw = String(v).trim();
  if (raw === "") return null;
  // Drop any non-digit / non-decimal-point character. Treat the LAST decimal
  // separator (either "." or ",") as the decimal point.
  const cleaned = raw.replace(/[^0-9.,-]/g, "");
  if (cleaned === "") return null;
  // If both . and , are present, the rightmost is the decimal separator;
  // strip the other as a grouping separator.
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalised: string;
  if (lastDot === -1 && lastComma === -1) {
    normalised = cleaned;
  } else if (lastDot > lastComma) {
    normalised = cleaned.replace(/,/g, "");
  } else {
    normalised = cleaned.replace(/\./g, "").replace(/,/g, ".");
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? String(n) : null;
}

/**
 * Extract every embedded image from sheet 1 of an .xlsx, save each via the
 * sharp pipeline under uploads/items/, and return a map from spreadsheet
 * data-row index (0-based, matching XLSX.sheet_to_json output) to the saved
 * relative path.
 *
 * The .xlsx ZIP layout is:
 *   xl/worksheets/_rels/sheet1.xml.rels       sheet → drawing relationship
 *   xl/drawings/drawing1.xml                   image anchors (rows + rIds)
 *   xl/drawings/_rels/drawing1.xml.rels        rId → media file
 *   xl/media/image*.png|jpg|...                actual image bytes
 *
 * Each anchor's `<xdr:from><xdr:row>N</xdr:row></xdr:from>` is 0-indexed,
 * with row 0 being the header — so data row index = N - 1.
 */
async function extractImagesByDataRow(
  fileBuffer: Buffer,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  try {
    // jszip is CommonJS; pull it in via require so the bundler doesn't bloat
    // every server action with it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(fileBuffer);

    // 1. Sheet 1 → drawing.
    const sheetRels = await zip
      .file("xl/worksheets/_rels/sheet1.xml.rels")
      ?.async("string");
    if (!sheetRels) return out;
    const drawingMatch = sheetRels.match(/Target="([^"]*drawings\/drawing(\d+)\.xml)"/);
    if (!drawingMatch) return out;
    const drawingNum = drawingMatch[2];
    const drawingPath = `xl/drawings/drawing${drawingNum}.xml`;
    const drawingRelsPath = `xl/drawings/_rels/drawing${drawingNum}.xml.rels`;

    const drawingXml = await zip.file(drawingPath)?.async("string");
    const drawingRels = await zip.file(drawingRelsPath)?.async("string");
    if (!drawingXml || !drawingRels) return out;

    // 2. Build rId → media path map.
    const ridToMedia = new Map<string, string>();
    for (const m of drawingRels.matchAll(/<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      const rid = m[1];
      const target = m[2].replace(/^\.\.\//, "xl/");
      ridToMedia.set(rid, target);
    }

    // 3. Walk every twoCellAnchor, pair its <xdr:row> with its <a:blip embed>.
    const anchorRegex = /<xdr:twoCellAnchor[^>]*>([\s\S]*?)<\/xdr:twoCellAnchor>/g;
    for (const a of drawingXml.matchAll(anchorRegex)) {
      const block = a[1];
      const rowMatch = block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
      const blipMatch = block.match(/<a:blip[^>]*r:embed="([^"]+)"/);
      if (!rowMatch || !blipMatch) continue;
      const xdrRow = parseInt(rowMatch[1], 10);
      const dataRowIdx = xdrRow - 1; // header is row 0
      if (dataRowIdx < 0) continue;
      const mediaPath = ridToMedia.get(blipMatch[1]);
      if (!mediaPath) continue;
      const mediaFile = zip.file(mediaPath);
      if (!mediaFile) continue;
      const buf: Buffer = await mediaFile.async("nodebuffer");
      try {
        const saved = await saveImageBuffer(buf, "items");
        out.set(dataRowIdx, saved.path);
      } catch {
        // Skip images sharp can't decode (corrupt / weird format).
      }
    }
  } catch {
    // Image extraction failure shouldn't fail the whole import.
  }
  return out;
}

/**
 * Parse the uploaded .xlsx, auto-detect column mapping, return preview rows.
 * Doesn't write to the DB — the user confirms first, then bulkCreateItems
 * runs with the parsed rows.
 */
export async function previewInventoryExcel(
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  const s = await auth();
  if (!s?.user?.id) return { ok: false, error: "Not signed in" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { ok: false, error: "Workbook has no sheets" };
    const sheet = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    });
    if (raw.length === 0) {
      return { ok: false, error: "Sheet is empty" };
    }

    const firstRow = raw[0];
    const detectedHeaders = Object.keys(firstRow).map((h) => ({
      raw: h,
      mapped: matchHeader(h),
    }));
    const mapByHeader: Partial<Record<string, keyof ParsedItemRow>> = {};
    for (const h of detectedHeaders) {
      if (h.mapped) mapByHeader[h.raw] = h.mapped;
    }
    if (!Object.values(mapByHeader).includes("name")) {
      return {
        ok: false,
        error:
          "Couldn't find a Name / Product column. Headers detected: " +
          detectedHeaders.map((h) => h.raw).join(", "),
      };
    }

    // Pull any embedded pictures out of sheet 1 in parallel with cell parsing.
    const imagesByRow = await extractImagesByDataRow(buf);

    const validRows: ParsedItemRow[] = [];
    const errors: { row: number; reason: string }[] = [];
    raw.forEach((row: Record<string, unknown>, idx: number) => {
      const out: ParsedItemRow = {
        name: "",
        description: null,
        variation: null,
        categoryName: null,
        unit: "pcs",
        reorder: "0",
        supplierName: null,
        location: null,
        reusable: false,
        shopeeUrl: null,
        qty: null,
        unitPrice: null,
        photoPath: imagesByRow.get(idx) ?? null,
      };
      for (const [header, key] of Object.entries(mapByHeader)) {
        if (!key) continue;
        const v = row[header];
        if (key === "reusable") out.reusable = parseBool(v);
        else if (key === "reorder") {
          const n = parseNumberLoose(v);
          out.reorder = n !== null && Number(n) >= 0 ? n : "0";
        } else if (key === "qty") {
          const n = parseNumberLoose(v);
          out.qty = n !== null && Number(n) > 0 ? n : null;
        } else if (key === "unitPrice") {
          const n = parseNumberLoose(v);
          out.unitPrice = n !== null && Number(n) >= 0 ? n : null;
        } else if (key === "name") out.name = asString(v);
        else if (key === "unit") out.unit = asString(v) || "pcs";
        else if (key === "description") out.description = asString(v) || null;
        else if (key === "variation") out.variation = asString(v) || null;
        else if (key === "categoryName") out.categoryName = asString(v) || null;
        else if (key === "supplierName") out.supplierName = asString(v) || null;
        else if (key === "location") out.location = asString(v) || null;
        else if (key === "shopeeUrl") out.shopeeUrl = asString(v) || null;
      }
      // Variation gets folded into the name: "Box 15cm — MERAH". Keeps
      // distinct stock entries per variant without needing a separate field.
      if (out.variation) {
        out.name = out.name ? `${out.name} — ${out.variation}` : out.variation;
      }
      if (!out.name) {
        errors.push({ row: idx + 2, reason: "Missing name / product" });
        return;
      }
      validRows.push(out);
    });

    return {
      ok: true,
      data: { totalRows: raw.length, validRows, detectedHeaders, errors },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to parse spreadsheet",
    };
  }
}

/**
 * Bulk-create items from the previewed rows. Auto-creates Category and
 * Supplier rows when a row references a name we don't have yet (so the
 * user doesn't have to pre-create every reference). All in one transaction.
 */
export async function bulkCreateItems(
  rows: ParsedItemRow[],
): Promise<
  ActionResult<{
    created: number;
    categoriesAdded: number;
    suppliersAdded: number;
    batchesCreated: number;
  }>
> {
  const uid = await userId();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Nothing to import" };
  }
  try {
    const result = await prisma.$transaction(
      async (tx: TransactionClient) => {
      const existingCats = await tx.category.findMany({ select: { id: true, name: true } });
      type IdName = { id: string; name: string };
      const catMap = new Map<string, string>(
        existingCats.map((c: IdName) => [c.name.toLowerCase(), c.id]),
      );
      const existingSups = await tx.supplier.findMany({ select: { id: true, name: true } });
      const supMap = new Map<string, string>(
        existingSups.map((s: IdName) => [s.name.toLowerCase(), s.id]),
      );
      // Compute the starting code ONCE outside the per-row loop. Calling
      // nextItemCode() inside the loop was an N+1 query — on a 500-row
      // import that's 500 extra round-trips just to figure out the next
      // SF##### number, blowing past even the 5-minute interactive
      // transaction timeout we set below. We bump it in memory instead.
      const startCode = await nextItemCode(tx);
      const startMatch = startCode.match(/^SF(\d+)$/);
      let nextCodeNumber = startMatch ? parseInt(startMatch[1], 10) : 1;
      const formatCode = () => `SF${String(nextCodeNumber).padStart(5, "0")}`;

      let categoriesAdded = 0;
      let suppliersAdded = 0;
      let batchesCreated = 0;
      const today = new Date();

      for (const r of rows) {
        let categoryId: string | null = null;
        if (r.categoryName) {
          const key = r.categoryName.toLowerCase();
          const existing = catMap.get(key);
          if (existing) {
            categoryId = existing;
          } else {
            const c = await tx.category.create({ data: { name: r.categoryName } });
            catMap.set(key, c.id);
            categoryId = c.id;
            categoriesAdded += 1;
          }
        }
        let supplierId: string | null = null;
        if (r.supplierName) {
          const key = r.supplierName.toLowerCase();
          const existing = supMap.get(key);
          if (existing) {
            supplierId = existing;
          } else {
            const sup = await tx.supplier.create({ data: { name: r.supplierName } });
            supMap.set(key, sup.id);
            supplierId = sup.id;
            suppliersAdded += 1;
          }
        }

        const code = formatCode();
        const item = await tx.item.create({
          data: {
            code,
            name: r.name,
            description: r.description,
            photoPath: r.photoPath,
            categoryId,
            unit: r.unit,
            reorder: new Decimal(r.reorder),
            reusable: r.reusable,
            location: r.location,
            shopeeUrl: r.shopeeUrl,
            defaultSupplierId: supplierId,
          },
        });
        // Increment AFTER a successful create so failures don't burn a
        // number. The unique index on (organizationId, code) would catch
        // a race but the in-memory counter keeps us out of trouble in
        // the normal path.
        nextCodeNumber += 1;

        // If the row has a real qty + price (e.g. a Shopee order export),
        // create a Batch too so the inventory shows actual stock rather
        // than just a definition with zero on-hand.
        if (r.qty && Number(r.qty) > 0 && r.unitPrice !== null) {
          const price = new Decimal(r.unitPrice);
          await tx.batch.create({
            data: {
              itemId: item.id,
              supplierId,
              date: today,
              qty: new Decimal(r.qty),
              price,
              exchangeRate: new Decimal(1),
              maxUses: r.reusable ? 1 : 1, // import doesn't expose maxUses yet
              useCount: 0,
              amortisedCostPerUse: null,
            },
          });
          batchesCreated += 1;
        }
      }

      await recordAction(tx, {
        type: "item.bulk_import",
        entityType: "Item",
        entityId: "",
        description: `Imported ${rows.length} items from Excel (+${categoriesAdded} categories, +${suppliersAdded} suppliers, +${batchesCreated} batches)`,
        userId: uid,
        payload: { count: rows.length, categoriesAdded, suppliersAdded, batchesCreated },
      });

      return {
        created: rows.length,
        categoriesAdded,
        suppliersAdded,
        batchesCreated,
      };
    },
    {
      // Default interactive transaction timeout is 5 s, but a typical
      // Shopee export is 300–500 rows × 2–3 db writes each. Give it 5
      // minutes so big spreadsheets still import atomically.
      maxWait: 15_000,
      timeout: 300_000,
    },
  );

    revalidatePath("/inventory");
    return { ok: true, data: result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to import",
    };
  }
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const uid = await userId();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const item = await tx.item.findUnique({ where: { id } });
    if (!item) throw new Error("Item not found");
    await tx.item.delete({ where: { id } });
    await recordAction(tx, {
      type: "item.delete",
      entityType: "Item",
      entityId: id,
      description: `Deleted item: ${item.name}`,
      userId: uid,
      payload: item,
    });
  });
  revalidatePath("/inventory");
  return { ok: true };
}

/**
 * Bulk-delete items + every row that references them. Used by the inventory
 * list multi-select toolbar so users can quickly clean up an Excel import
 * that brought in some unwanted rows.
 *
 * Cascade order (FK-safe):
 *   batch_consumptions  ->  harvest_usages / harvest_assets  ->  batches  ->  items
 *
 * Single transaction so partial deletes can't leave the DB in a broken state.
 */
export async function deleteItems(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No items selected" };
  }
  const uid = await userId();
  try {
    const deleted = await prisma.$transaction(async (tx: TransactionClient) => {
      const items = await tx.item.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      if (items.length === 0) return 0;
      const batchIds = (
        await tx.batch.findMany({ where: { itemId: { in: ids } }, select: { id: true } })
      ).map((b: { id: string }) => b.id);

      if (batchIds.length > 0) {
        await tx.batchConsumption.deleteMany({ where: { batchId: { in: batchIds } } });
      }
      await tx.harvestUsage.deleteMany({ where: { itemId: { in: ids } } });
      await tx.harvestAsset.deleteMany({ where: { itemId: { in: ids } } });
      await tx.batch.deleteMany({ where: { itemId: { in: ids } } });
      await tx.item.deleteMany({ where: { id: { in: ids } } });

      await recordAction(tx, {
        type: "item.bulk_delete",
        entityType: "Item",
        entityId: items[0].id,
        description: `Deleted ${items.length} items: ${items
          .slice(0, 3)
          .map((i: { name: string }) => i.name)
          .join(", ")}${items.length > 3 ? `, +${items.length - 3} more` : ""}`,
        userId: uid,
        payload: { ids, names: items.map((i: { name: string }) => i.name) },
      });
      return items.length;
    });
    revalidatePath("/inventory");
    return { ok: true, data: { deleted } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete items" };
  }
}

// ============================================================================
// Merge two items (consolidate duplicates from different suppliers)
// ============================================================================

/**
 * Preview what would move if `sourceId` were merged into `targetId`.
 *
 * Used by the merge dialog to show the user "this many batches and harvest
 * usages will move to the target" before they pull the trigger. The actual
 * merge is a separate call so the preview can be re-rendered if the user
 * picks a different target.
 */
const mergePreviewSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function mergeItemsPreview(input: unknown): Promise<
  ActionResult<{
    source: { id: string; code: string; name: string; unit: string };
    target: { id: string; code: string; name: string; unit: string };
    batchesToMove: number;
    usagesToMove: number;
    assetsToMove: number;
    /** Set when source.unit ≠ target.unit — block the merge until the
     *  user reconciles, otherwise qty math goes sideways. */
    unitMismatch: string | null;
    /** Soft warning when source and target have different sub_factor (e.g.
     *  25 kg bag vs 1 kg bag). Merge would flatten both into "pcs", losing
     *  the weight context — better to use Product Family instead. */
    packSizeMismatch: string | null;
  }>
> {
  const parsed = mergePreviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (parsed.data.sourceId === parsed.data.targetId) {
    return { ok: false, error: "Can't merge an item with itself" };
  }
  const [source, target, batchesToMove, usagesToMove, assetsToMove] = await Promise.all([
    prisma.item.findFirst({
      where: { id: parsed.data.sourceId },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        subUnit: true,
        subFactor: true,
      },
    }),
    prisma.item.findFirst({
      where: { id: parsed.data.targetId },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        subUnit: true,
        subFactor: true,
      },
    }),
    prisma.batch.count({ where: { itemId: parsed.data.sourceId } }),
    prisma.harvestUsage.count({ where: { itemId: parsed.data.sourceId } }),
    prisma.harvestAsset.count({ where: { itemId: parsed.data.sourceId } }),
  ]);
  if (!source) return { ok: false, error: "Source item not found" };
  if (!target) return { ok: false, error: "Target item not found" };
  const unitMismatch =
    source.unit !== target.unit
      ? `Source is "${source.unit}", target is "${target.unit}". Merge would silently mix the unit. Make them match first via Edit on either item.`
      : null;
  // Soft warn (not blocking) when the items are clearly different pack
  // sizes — the classic 25 kg vs 1 kg case. Both are "pcs" so the unit
  // check passes, but consolidating them would lose the weight context.
  // The user almost always wants Product Family in that situation, not
  // a destructive merge.
  const srcFactor = source.subFactor ? Number(source.subFactor) : null;
  const tgtFactor = target.subFactor ? Number(target.subFactor) : null;
  const packSizeMismatch =
    !unitMismatch &&
    srcFactor &&
    tgtFactor &&
    Math.abs(srcFactor - tgtFactor) > 0.001
      ? `Different pack sizes: source is ${srcFactor} ${source.subUnit ?? "units"}/pack, target is ${tgtFactor} ${target.subUnit ?? "units"}/pack. Merging will flatten both as "${source.unit}" and lose the per-pack weight context. If you want to keep them separate but see a combined total, use the **Product Family** field on each item instead.`
      : null;
  return {
    ok: true,
    data: {
      source: {
        id: source.id,
        code: source.code,
        name: source.name?.trim() || `(Untitled ${source.code})`,
        unit: source.unit,
      },
      target: {
        id: target.id,
        code: target.code,
        name: target.name?.trim() || `(Untitled ${target.code})`,
        unit: target.unit,
      },
      batchesToMove,
      usagesToMove,
      assetsToMove,
      unitMismatch,
      packSizeMismatch,
    },
  };
}

/**
 * Move every Batch / HarvestUsage / HarvestAsset from source → target, then
 * delete the source item. One transaction so a mid-merge failure rolls back
 * cleanly. The source item's photo file is intentionally left on disk —
 * cheap to keep, awkward if a future "undo" relied on it being there.
 */
const mergeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function mergeItems(input: unknown): Promise<
  ActionResult<{
    batchesMoved: number;
    usagesMoved: number;
    assetsMoved: number;
    targetId: string;
  }>
> {
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (parsed.data.sourceId === parsed.data.targetId) {
    return { ok: false, error: "Can't merge an item with itself" };
  }
  const uid = await userId();
  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      const [source, target] = await Promise.all([
        tx.item.findFirst({
          where: { id: parsed.data.sourceId },
          select: { id: true, code: true, name: true, unit: true },
        }),
        tx.item.findFirst({
          where: { id: parsed.data.targetId },
          select: { id: true, code: true, name: true, unit: true },
        }),
      ]);
      if (!source) throw new Error("Source item not found");
      if (!target) throw new Error("Target item not found");
      if (source.unit !== target.unit) {
        throw new Error(
          `Unit mismatch: source "${source.unit}" vs target "${target.unit}". Make them match first.`,
        );
      }

      const [bResult, uResult, aResult] = await Promise.all([
        tx.batch.updateMany({
          where: { itemId: source.id },
          data: { itemId: target.id },
        }),
        tx.harvestUsage.updateMany({
          where: { itemId: source.id },
          data: { itemId: target.id },
        }),
        tx.harvestAsset.updateMany({
          where: { itemId: source.id },
          data: { itemId: target.id },
        }),
      ]);

      // Source has no more child rows pointing at it — safe to delete.
      await tx.item.delete({ where: { id: source.id } });

      await recordAction(tx, {
        type: "item.merged",
        entityType: "Item",
        entityId: target.id,
        description: `Merged "${source.name?.trim() || source.code}" (${source.code}) into "${target.name?.trim() || target.code}" (${target.code})`,
        userId: uid,
        payload: {
          sourceId: source.id,
          sourceCode: source.code,
          sourceName: source.name,
          targetId: target.id,
          targetCode: target.code,
          batchesMoved: bResult.count,
          usagesMoved: uResult.count,
          assetsMoved: aResult.count,
        },
      });

      return {
        batchesMoved: bResult.count,
        usagesMoved: uResult.count,
        assetsMoved: aResult.count,
        targetId: target.id,
      };
    });

    revalidatePath("/inventory");
    revalidatePath(`/inventory/${parsed.data.targetId}`);
    revalidatePath("/health-check");
    revalidatePath("/health-check/stocktake");
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Merge failed" };
  }
}

/**
 * Combine two pack-style items into ONE item denominated in their shared
 * sub-unit (e.g. a 25 kg bag and a 1 kg bag of "Meroke Calnit" both with
 * subUnit="kg" — after combine you have a single SKU with unit="kg" and
 * the full purchase history visible in kg).
 *
 * Requirements:
 *   - Both items must have a sub_unit set, and the sub_units must match.
 *     (If they don't, the merge action is wrong too — different substances.)
 *   - The target's existing batches get re-recorded in sub-units in place
 *     (qty × subFactor, price ÷ subFactor — total cost per batch invariant).
 *   - The source's batches move to the target and get the same treatment.
 *   - HarvestUsage / HarvestAsset rows from the source also re-point and
 *     get qty multiplied — so a "used 3 pcs of source" usage becomes
 *     "used 3 × sourceSubFactor kg of target".
 *   - The target's `unit` becomes the shared sub_unit; its sub_unit /
 *     sub_factor get cleared (no longer a pack — it IS the canonical unit).
 *   - The source row is deleted.
 *
 * Audit-logged so the user can see exactly what got rewritten and roll
 * back via the action history if it was a mistake.
 */
const combineSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function combineItems(input: unknown): Promise<
  ActionResult<{
    targetId: string;
    /** Total stock on the resulting item, denominated in the shared
     *  sub-unit (e.g. 60 if 25 kg + 25 kg + 10 × 1 kg combined). */
    newTotalSubUnits: string;
    /** The sub-unit the combined item is now measured in. */
    subUnit: string;
    /** Batches re-recorded on the target (source's batches that moved
     *  + target's existing batches that got converted in-place). */
    batchesAffected: number;
  }>
> {
  const parsed = combineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (parsed.data.sourceId === parsed.data.targetId) {
    return { ok: false, error: "Can't combine an item with itself" };
  }
  const uid = await userId();
  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      const [source, target] = await Promise.all([
        tx.item.findFirst({
          where: { id: parsed.data.sourceId },
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            subUnit: true,
            subFactor: true,
          },
        }),
        tx.item.findFirst({
          where: { id: parsed.data.targetId },
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            subUnit: true,
            subFactor: true,
          },
        }),
      ]);
      if (!source) throw new Error("Source item not found");
      if (!target) throw new Error("Target item not found");
      if (!source.subUnit || !source.subFactor)
        throw new Error(
          `Source "${source.code}" needs pack info set first (Edit → "Sold as a pack used in fractions" + sub-unit + pack size).`,
        );
      if (!target.subUnit || !target.subFactor)
        throw new Error(
          `Target "${target.code}" needs pack info set first (Edit → "Sold as a pack used in fractions" + sub-unit + pack size).`,
        );
      if (source.subUnit !== target.subUnit) {
        throw new Error(
          `Sub-units differ (${source.subUnit} vs ${target.subUnit}) — these aren't really the same substance.`,
        );
      }
      const sFactor = new Decimal(source.subFactor);
      const tFactor = new Decimal(target.subFactor);
      const subUnit = source.subUnit;

      // --- 1. Convert TARGET's existing batches in-place ----------------
      // qty × subFactor       (e.g. 10 bags × 1 kg → 10 kg)
      // price ÷ subFactor     (e.g. Rp 10,000/bag ÷ 1 kg/bag → Rp 10,000/kg)
      // Total batch cost (qty × price) stays invariant.
      const targetBatches = await tx.batch.findMany({
        where: { itemId: target.id },
        select: { id: true, qty: true, price: true, amortisedCostPerUse: true },
      });
      for (const b of targetBatches as {
        id: string;
        qty: Decimal;
        price: Decimal;
        amortisedCostPerUse: Decimal | null;
      }[]) {
        await tx.batch.update({
          where: { id: b.id },
          data: {
            qty: new Decimal(b.qty).times(tFactor),
            price: new Decimal(b.price).div(tFactor),
            amortisedCostPerUse: b.amortisedCostPerUse
              ? new Decimal(b.amortisedCostPerUse).div(tFactor)
              : null,
          },
        });
      }

      // --- 2. Convert SOURCE's batches + re-point to target -------------
      const sourceBatches = await tx.batch.findMany({
        where: { itemId: source.id },
        select: { id: true, qty: true, price: true, amortisedCostPerUse: true },
      });
      for (const b of sourceBatches as {
        id: string;
        qty: Decimal;
        price: Decimal;
        amortisedCostPerUse: Decimal | null;
      }[]) {
        await tx.batch.update({
          where: { id: b.id },
          data: {
            itemId: target.id,
            qty: new Decimal(b.qty).times(sFactor),
            price: new Decimal(b.price).div(sFactor),
            amortisedCostPerUse: b.amortisedCostPerUse
              ? new Decimal(b.amortisedCostPerUse).div(sFactor)
              : null,
          },
        });
      }

      // --- 3. HarvestUsage / HarvestAsset for SOURCE ---------------------
      // These reference itemId (no batch link required for the qty) — move
      // them and multiply qty by source's subFactor so "used 2 source-bags"
      // becomes "used 50 kg".
      const sourceUsages = await tx.harvestUsage.findMany({
        where: { itemId: source.id },
        select: { id: true, qty: true },
      });
      for (const u of sourceUsages as { id: string; qty: Decimal }[]) {
        await tx.harvestUsage.update({
          where: { id: u.id },
          data: { itemId: target.id, qty: new Decimal(u.qty).times(sFactor) },
        });
      }
      const sourceAssets = await tx.harvestAsset.findMany({
        where: { itemId: source.id },
        select: { id: true, qty: true, amortisedCharge: true },
      });
      for (const a of sourceAssets as {
        id: string;
        qty: Decimal;
        amortisedCharge: Decimal | null;
      }[]) {
        await tx.harvestAsset.update({
          where: { id: a.id },
          data: {
            itemId: target.id,
            qty: new Decimal(a.qty).times(sFactor),
            // amortisedCharge is a TOTAL cost figure already, not per-unit —
            // it stays the same (the charge was on the old pack basis).
            amortisedCharge: a.amortisedCharge,
          },
        });
      }

      // --- 4. HarvestUsage / HarvestAsset for TARGET ---------------------
      // Convert in-place too (qty × tFactor).
      const targetUsages = await tx.harvestUsage.findMany({
        where: { itemId: target.id },
        select: { id: true, qty: true },
      });
      for (const u of targetUsages as { id: string; qty: Decimal }[]) {
        await tx.harvestUsage.update({
          where: { id: u.id },
          data: { qty: new Decimal(u.qty).times(tFactor) },
        });
      }
      const targetAssets = await tx.harvestAsset.findMany({
        where: { itemId: target.id },
        select: { id: true, qty: true },
      });
      for (const a of targetAssets as { id: string; qty: Decimal }[]) {
        await tx.harvestAsset.update({
          where: { id: a.id },
          data: { qty: new Decimal(a.qty).times(tFactor) },
        });
      }

      // --- 5. Promote target's unit to the sub-unit, clear pack info ----
      await tx.item.update({
        where: { id: target.id },
        data: { unit: subUnit, subUnit: null, subFactor: null },
      });

      // --- 6. Delete source ---------------------------------------------
      await tx.item.delete({ where: { id: source.id } });

      // Compute new stock total in sub-units for the result message.
      const finalBatches = await tx.batch.findMany({
        where: { itemId: target.id },
        select: { qty: true, consumptions: { select: { qty: true } } },
      });
      type FB = { qty: Decimal; consumptions: { qty: Decimal }[] };
      const newTotalSubUnits = (finalBatches as FB[]).reduce(
        (s: Decimal, b: FB) => {
          const consumed = b.consumptions.reduce(
            (cs: Decimal, c: { qty: Decimal }) => cs.plus(c.qty),
            new Decimal(0),
          );
          return s.plus(new Decimal(b.qty).minus(consumed));
        },
        new Decimal(0),
      );

      const batchesAffected = sourceBatches.length + targetBatches.length;

      await recordAction(tx, {
        type: "item.combined",
        entityType: "Item",
        entityId: target.id,
        description: `Combined "${source.name?.trim() || source.code}" + "${target.name?.trim() || target.code}" into one ${subUnit}-based item (${newTotalSubUnits.toFixed(2)} ${subUnit} total)`,
        userId: uid,
        payload: {
          sourceId: source.id,
          sourceCode: source.code,
          sourceName: source.name,
          sourceSubFactor: sFactor.toString(),
          targetId: target.id,
          targetCode: target.code,
          targetSubFactor: tFactor.toString(),
          subUnit,
          batchesAffected,
          newTotalSubUnits: newTotalSubUnits.toString(),
        },
      });

      return {
        targetId: target.id,
        newTotalSubUnits: newTotalSubUnits.toFixed(2).replace(/\.?0+$/, ""),
        subUnit,
        batchesAffected,
      };
    });

    revalidatePath("/inventory");
    revalidatePath(`/inventory/${parsed.data.targetId}`);
    revalidatePath("/health-check");
    revalidatePath("/health-check/stocktake");
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Combine failed" };
  }
}

/**
 * Tiny autocomplete query used by the merge dialog's "merge into …" picker.
 * Caps at 20 results — the dialog only needs enough to pick the right one,
 * and a 561-row dropdown is unusable anyway.
 */
const mergeSearchSchema = z.object({
  query: z.string().max(120),
  excludeId: z.string().optional(),
});

export async function searchMergeTargets(input: unknown): Promise<
  ActionResult<{ id: string; code: string; name: string; unit: string; stock: string }[]>
> {
  const parsed = mergeSearchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const q = parsed.data.query.trim();
  if (q.length < 1) return { ok: true, data: [] };

  const items = await prisma.item.findMany({
    where: {
      AND: [
        parsed.data.excludeId ? { id: { not: parsed.data.excludeId } } : {},
        {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } },
          ],
        },
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      batches: {
        select: {
          qty: true,
          consumptions: { select: { qty: true } },
        },
      },
    },
  });
  type ItemRow = {
    id: string;
    code: string;
    name: string;
    unit: string;
    batches: { qty: Decimal; consumptions: { qty: Decimal }[] }[];
  };
  return {
    ok: true,
    data: (items as ItemRow[]).map((it) => {
      const stock = it.batches.reduce((s: Decimal, b) => {
        const consumed = b.consumptions.reduce(
          (cs: Decimal, c) => cs.plus(c.qty),
          new Decimal(0),
        );
        return s.plus(new Decimal(b.qty).minus(consumed));
      }, new Decimal(0));
      return {
        id: it.id,
        code: it.code,
        name: it.name?.trim() || `(Untitled ${it.code})`,
        unit: it.unit,
        stock: stock.toFixed(0),
      };
    }),
  };
}

// ============================================================================
// AI: guess what an unnamed item is from its context
// ============================================================================

/**
 * For inventory items that came in with an empty / blank name (~265 came
 * from the legacy farm-legacy.js seed). Builds a context bundle from every
 * signal we have on the row — code, category, suppliers we've bought it
 * from, recent batch prices, recent harvest usage — and asks the AI chain
 * to guess a name + a one-line description.
 *
 * The caller (the IdentifyItemPanel on /inventory/[itemId]) renders the
 * suggestion in an editable form so the user can accept-as-is or tweak
 * before saving via `updateItem`.
 */
const identifyInputSchema = z.object({ itemId: z.string().min(1) });

export async function suggestItemIdentity(input: unknown): Promise<
  ActionResult<{
    name: string;
    description: string;
    confidence: "Strong" | "Plausible" | "Weak";
    reason: string;
  }>
> {
  const parsed = identifyInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  // Lazy imports so the bundle penalty (and Anthropic SDK) stays out of
  // anyone who only needs the rest of this module.
  const { ask } = await import("@/server/ai-chain");
  const { extractJson } = await import("@/server/json-extract");

  const item = await prisma.item.findFirst({
    where: { id: parsed.data.itemId },
    include: {
      category: { select: { name: true } },
      defaultSupplier: { select: { name: true } },
      batches: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 10,
        select: {
          date: true,
          qty: true,
          price: true,
          supplier: { select: { name: true } },
        },
      },
      harvestUsages: {
        orderBy: { date: "desc" },
        take: 5,
        select: {
          qty: true,
          displayQty: true,
          date: true,
          harvest: { select: { name: true, produce: { select: { name: true } } } },
        },
      },
      harvestAssets: {
        orderBy: { date: "desc" },
        take: 5,
        select: {
          qty: true,
          date: true,
          reusable: true,
          harvest: { select: { name: true } },
        },
      },
    },
  });
  if (!item) return { ok: false, error: "Item not found" };
  if (item.name?.trim()) {
    return {
      ok: false,
      error: "Item already has a name — edit it directly via the Edit button.",
    };
  }

  // Build a tight context blob the model can reason over. Keep it under a
  // few hundred tokens so latency stays low even on the slowest provider
  // in the chain.
  type BatchLite = {
    date: Date;
    qty: { toString: () => string };
    price: { toString: () => string };
    supplier: { name: string } | null;
  };
  type UsageLite = {
    qty: { toString: () => string };
    displayQty: string | null;
    date: Date;
    harvest: { name: string; produce: { name: string } | null };
  };
  type AssetLite = {
    qty: { toString: () => string };
    date: Date;
    reusable: boolean;
    harvest: { name: string };
  };

  const supplierLine = (item.batches as BatchLite[])
    .filter((b) => !!b.supplier)
    .slice(0, 5)
    .map(
      (b) =>
        `  - ${b.supplier!.name} · ${b.qty.toString()} ${item.unit} @ ${b.price.toString()} on ${b.date.toISOString().slice(0, 10)}`,
    )
    .join("\n");

  const usageLines = (item.harvestUsages as UsageLite[])
    .slice(0, 3)
    .map(
      (u) =>
        `  - used ${u.displayQty ?? `${u.qty.toString()} ${item.unit}`} on ${u.harvest.produce?.name ?? "harvest"} "${u.harvest.name}"`,
    )
    .join("\n");

  const assetLines = (item.harvestAssets as AssetLite[])
    .slice(0, 3)
    .map(
      (a) =>
        `  - installed ${a.qty.toString()} ${item.unit} on greenhouse cycle "${a.harvest.name}" (${a.reusable ? "reusable" : "fixed"})`,
    )
    .join("\n");

  const prompt = `You identify hydroponic-farm inventory items that came in with a blank name.

Use every signal available to guess what this item most likely is. Be specific (brand, size, format when inferable). If the signal is too weak to guess, return name "Unknown item".

Item:
  Code: ${item.code}
  Unit: ${item.unit}${item.subUnit && item.subFactor ? ` (pack of ${item.subFactor.toString()} ${item.subUnit})` : ""}
  Category: ${item.category?.name ?? "(none)"}
  Default supplier: ${item.defaultSupplier?.name ?? "(none)"}
  Reusable: ${item.reusable ? "yes" : "no"}
  Existing description: ${item.description?.trim() || "(none)"}

Recent purchases:
${supplierLine || "  (no purchases recorded)"}

Recent greenhouse usage:
${usageLines || "  (none)"}

Recent greenhouse installs:
${assetLines || "  (none)"}

Reply with ONE JSON object, no markdown:
{
  "name": "Rockwool propagation cube 50mm",
  "description": "Single-line description, ≤ 18 words.",
  "confidence": "Strong" | "Plausible" | "Weak",
  "reason": "Brief justification — which signal led you to this guess."
}`;

  let raw: string;
  try {
    raw = await ask({
      prompt,
      json: true,
      maxTokens: 600,
      disableThinking: true,
      timeoutMs: 60_000,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }

  type ModelOut = {
    name?: string;
    description?: string;
    confidence?: string;
    reason?: string;
  };
  let parsedOut: ModelOut;
  try {
    parsedOut = extractJson<ModelOut>(raw);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "AI returned malformed JSON",
    };
  }

  const name = typeof parsedOut.name === "string" ? parsedOut.name.trim() : "";
  const description =
    typeof parsedOut.description === "string" ? parsedOut.description.trim() : "";
  const conf = (parsedOut.confidence ?? "").toString();
  const confidence: "Strong" | "Plausible" | "Weak" =
    /strong/i.test(conf) ? "Strong" : /weak/i.test(conf) ? "Weak" : "Plausible";

  if (!name) {
    return { ok: false, error: "AI couldn't infer a name from the available context." };
  }

  return {
    ok: true,
    data: {
      name,
      description,
      confidence,
      reason: typeof parsedOut.reason === "string" ? parsedOut.reason : "",
    },
  };
}

/**
 * Save an identity decision (name + description) onto an item.
 *
 * Slimmer than updateItem because the panel only ever changes these two
 * fields — there's no risk of stomping the user's photo, category, etc.
 */
const acceptIdentitySchema = z.object({
  itemId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function acceptItemIdentity(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = acceptIdentitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const uid = await userId();
  try {
    const updated = await prisma.item.update({
      where: { id: parsed.data.itemId },
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
      },
      select: { id: true, name: true },
    });
    await recordAction(prisma, {
      type: "item.identified",
      entityType: "Item",
      entityId: updated.id,
      description: `Identified item as "${updated.name}"`,
      userId: uid,
      payload: { name: parsed.data.name, description: parsed.data.description },
    });
    revalidatePath(`/inventory/${parsed.data.itemId}`);
    revalidatePath("/inventory");
    revalidatePath("/health-check");
    return { ok: true, data: updated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save" };
  }
}

// ============================================================================
// Stock-take
// ============================================================================

/**
 * One-shot per-item stock-take adjustment.
 *
 * Used by the wizard at /health-check/stocktake to fix:
 *   1. Items that should be tracked as packs of sub-units (set subUnit +
 *      subFactor so polybag-with-50-pcs reads as 50 pcs).
 *   2. Stock levels that drifted because purchases / usages weren't logged
 *      while the farm was bootstrapping the app.
 *
 * Behaviour:
 *   - If `subUnit` + `subFactor` are passed, they're applied to the Item.
 *   - If `actualQtyInSubUnit` is non-null, the stock level is adjusted to
 *     that amount. The actual value is interpreted in SUB-UNITS when the
 *     item has a subFactor (after the optional update above), otherwise
 *     in the item's plain unit.
 *     - delta > 0 → create a new Batch (qty = delta, price = 0,
 *       supplierId = null, date = today) marked as a stock-take fill.
 *     - delta < 0 → consume the missing qty via FIFO (BatchConsumption rows
 *       with both harvestAssetId and harvestUsageId NULL — these are the
 *       canonical "stock-take consumed" entries).
 *     - delta = 0 → no batches touched; only the Item update (if any).
 *   - A single audit log entry records the before/after stock so the
 *     Financials page can attribute the change to a stock-take, not a
 *     phantom harvest.
 */
const stocktakeSchema = z.object({
  itemId: z.string(),
  // Pack info (optional — only sent when the user toggled "this is a pack").
  subUnit: z.string().nullable().optional(),
  subFactor: z.string().regex(/^[0-9.]*$/).nullable().optional(),
  // Actual on-hand quantity, in sub-units when subFactor is set on the item,
  // else in plain units. Null = skip the stock adjustment (only update item).
  actualQtyInSubUnit: z.string().regex(/^[0-9.]+$/).nullable().optional(),
  /** Free-text note shown in the audit log, e.g. "Counted shelf 3 after
   *  morning harvest". Optional. */
  note: z.string().max(500).optional(),
});

export async function applyStocktake(input: unknown): Promise<ActionResult<{
  beforePacks: string;
  afterPacks: string;
  deltaPacks: string;
}>> {
  const parsed = stocktakeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid stock-take input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const uid = await userId();
  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      // 1. Load the item.
      const item = await tx.item.findFirst({
        where: { id: parsed.data.itemId },
        select: {
          id: true,
          name: true,
          unit: true,
          subUnit: true,
          subFactor: true,
        },
      });
      if (!item) throw new Error("Item not found");

      // 2. Apply pack-info update if passed. We treat empty strings the same
      // as "leave alone" — the wizard sends nulls when the toggle is off.
      const newSubUnit = parsed.data.subUnit?.trim() || null;
      const newSubFactor =
        parsed.data.subFactor?.trim() && Number(parsed.data.subFactor) > 0
          ? new Decimal(parsed.data.subFactor)
          : null;
      const subUnitChanged = newSubUnit !== (item.subUnit ?? null);
      const subFactorChanged =
        (newSubFactor?.toString() ?? null) !==
        (item.subFactor?.toString() ?? null);
      if (subUnitChanged || subFactorChanged) {
        await tx.item.update({
          where: { id: item.id },
          data: { subUnit: newSubUnit, subFactor: newSubFactor },
        });
      }

      // Effective pack factor for the stock-adjust math below — use the
      // new value if just set, else fall back to the existing item value.
      const effectiveSubFactor = newSubFactor ?? item.subFactor ?? null;

      // 3. Compute current stock in packs.
      const batches = await tx.batch.findMany({
        where: { itemId: item.id },
        select: {
          id: true,
          qty: true,
          price: true,
          exchangeRate: true,
          consumptions: { select: { qty: true } },
        },
      });
      const currentPacks = batches.reduce((sum: Decimal, b) => {
        const consumed = b.consumptions.reduce(
          (s: Decimal, c) => s.plus(c.qty),
          new Decimal(0),
        );
        return sum.plus(new Decimal(b.qty).minus(consumed));
      }, new Decimal(0));

      // 4. If no actual qty given, we're done (just updating pack info).
      if (
        parsed.data.actualQtyInSubUnit === undefined ||
        parsed.data.actualQtyInSubUnit === null
      ) {
        await recordAction(tx, {
          type: "inventory.stocktake_packinfo",
          entityType: "Item",
          entityId: item.id,
          description: `Stock-take: pack info updated for "${item.name}"`,
          userId: uid,
          payload: {
            itemId: item.id,
            subUnit: newSubUnit,
            subFactor: newSubFactor?.toString() ?? null,
          },
        });
        return {
          beforePacks: currentPacks.toFixed(4),
          afterPacks: currentPacks.toFixed(4),
          deltaPacks: "0",
        };
      }

      // 5. Convert the user's input → packs.
      const enteredAsSub = new Decimal(parsed.data.actualQtyInSubUnit);
      const targetPacks =
        effectiveSubFactor && effectiveSubFactor.gt(0)
          ? enteredAsSub.div(effectiveSubFactor)
          : enteredAsSub;
      const deltaPacks = targetPacks.minus(currentPacks);

      // 6. Apply the delta.
      if (deltaPacks.gt(0)) {
        // Need more stock. Create a price=0 batch dated today. The exchange
        // rate from the most recent batch (or 1 if none) is preserved so
        // financials views don't NaN.
        const lastRate =
          batches[batches.length - 1]?.exchangeRate ?? new Decimal(1);
        await tx.batch.create({
          data: {
            itemId: item.id,
            qty: deltaPacks,
            price: new Decimal(0),
            exchangeRate: lastRate,
            date: new Date(),
            supplierId: null,
          },
        });
      } else if (deltaPacks.lt(0)) {
        // Need less stock. Consume |delta| from FIFO-top batches.
        const { consumed } = await consumeFifo(
          tx,
          item.id,
          deltaPacks.abs(),
        );
        for (const c of consumed) {
          await tx.batchConsumption.create({
            data: {
              batchId: c.batchId,
              qty: new Decimal(c.qty),
              unitCost: new Decimal(c.unitCost),
              // harvestAssetId + harvestUsageId stay NULL — that's the
              // signal that this row is a stock-take adjustment, not a
              // harvest install or a recorded usage.
            },
          });
        }
      }

      await recordAction(tx, {
        type: "inventory.stocktake",
        entityType: "Item",
        entityId: item.id,
        description: `Stock-take: "${item.name}" ${currentPacks.toFixed(2)} → ${targetPacks.toFixed(2)} ${item.unit}${parsed.data.note ? ` (${parsed.data.note})` : ""}`,
        userId: uid,
        payload: {
          itemId: item.id,
          beforePacks: currentPacks.toFixed(4),
          afterPacks: targetPacks.toFixed(4),
          deltaPacks: deltaPacks.toFixed(4),
          subUnit: newSubUnit,
          subFactor: newSubFactor?.toString() ?? null,
          note: parsed.data.note ?? null,
        },
      });

      return {
        beforePacks: currentPacks.toFixed(4),
        afterPacks: targetPacks.toFixed(4),
        deltaPacks: deltaPacks.toFixed(4),
      };
    });

    revalidatePath("/inventory");
    revalidatePath("/health-check");
    revalidatePath("/health-check/stocktake");
    revalidatePath("/financials");
    return { ok: true, data: result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Stock-take failed",
    };
  }
}
