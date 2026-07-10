"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/server/prisma";
import { requireSuperuser } from "@/server/authz";
import { translateItemNames, TRANSLATE_BATCH_SIZE } from "@/server/item-translate";

export type TranslateNamesResult =
  | { ok: true; translated: number; remaining: number }
  | { ok: false; error: string };

/**
 * Generate English display names for ONE batch of items that don't have one
 * yet (Item.nameEn is null). The Health Check card calls this repeatedly until
 * `remaining` hits 0, so each round-trip stays well inside action timeouts and
 * the user sees progress. Superuser-only — it spends AI credits.
 */
export async function generateEnglishNamesBatch(): Promise<TranslateNamesResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };

  const rows = await prisma.item.findMany({
    where: { nameEn: null },
    orderBy: { code: "asc" },
    take: TRANSLATE_BATCH_SIZE,
    select: { id: true, name: true },
  });
  if (rows.length === 0) return { ok: true, translated: 0, remaining: 0 };

  let translated: Map<string, string>;
  try {
    translated = await translateItemNames(rows);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI translation failed" };
  }

  // Rows the model skipped keep their ORIGINAL name as the English name —
  // display-identical to null, but it moves them out of the queue so the
  // batch loop always terminates (otherwise a stubborn row is re-fetched
  // and re-skipped forever).
  for (const r of rows) {
    const nameEn = translated.get(r.id) ?? r.name;
    await prisma.item.update({ where: { id: r.id }, data: { nameEn } });
  }

  const remaining = await prisma.item.count({ where: { nameEn: null } });
  revalidatePath("/health-check");
  revalidatePath("/inventory");
  return { ok: true, translated: rows.length, remaining };
}
