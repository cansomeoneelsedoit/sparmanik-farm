/**
 * One-off backfill: generate English display names (Item.nameEn) for every
 * item that doesn't have one. Same core path as the Health Check card's
 * "Generate" button (translateItemNames + per-row update) — this script just
 * lets the first big backfill run headless instead of clicking through
 * ~18 batches in the browser.
 *
 *   docker compose exec web npx tsx scripts/translate-item-names.ts
 *
 * Uses the same AI chain as the app (per-org keys from Settings → AI keys,
 * falling back to env keys). Idempotent — rows with nameEn set are skipped,
 * so it can be re-run after adding items.
 */
import { prisma } from "../src/server/prisma";
import { translateItemNames, TRANSLATE_BATCH_SIZE } from "../src/server/item-translate";

async function main() {
  let round = 0;
  for (;;) {
    const rows = await prisma.item.findMany({
      where: { nameEn: null },
      orderBy: { code: "asc" },
      take: TRANSLATE_BATCH_SIZE,
      select: { id: true, name: true },
    });
    if (rows.length === 0) break;
    round++;

    const translated = await translateItemNames(rows);
    for (const r of rows) {
      const nameEn = translated.get(r.id) ?? r.name; // skipped → keep original
      await prisma.item.update({ where: { id: r.id }, data: { nameEn } });
    }
    const remaining = await prisma.item.count({ where: { nameEn: null } });
    console.log(`[batch ${round}] translated ${translated.size}/${rows.length}, remaining ${remaining}`);
  }
  console.log("Done — every item has an English display name.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
