#!/usr/bin/env node
/**
 * Audits that every t("key") used in components actually resolves in BOTH
 * locale catalogues, through next-intl's real ICU formatter. Catches the
 * runtime-only bugs the type-checker can't: typo'd keys, missing
 * placeholders, broken plural syntax.
 *
 *   node scripts/check-i18n-usage.mjs
 *
 * Heuristic, not a compiler: it maps `const x = useTranslations("ns")` /
 * `getTranslations("ns")` bindings per file, then resolves every `x("key")`
 * call against ns.key. Good enough to keep the staff-facing flows honest.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const en = JSON.parse(readFileSync(path.join(ROOT, "src/i18n/messages/en.json"), "utf8"));
const id = JSON.parse(readFileSync(path.join(ROOT, "src/i18n/messages/id.json"), "utf8"));

// Dummy values for every placeholder any of our messages use.
const PARAMS = {
  count: 2, shown: 3, total: 9, max: "9", unit: "kg", sub: "kg",
  name: "Contoh", price: "1.000", date: "2026-06-12", supplier: "Toko",
  n: 5, amount: "10.000",
};

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts)$/.test(p) && !p.endsWith(".test.ts")) yield p;
  }
}

let failed = false;
let checked = 0;

for (const file of walk(SRC)) {
  const code = readFileSync(file, "utf8");
  // const t = useTranslations("ns")  |  const t = await getTranslations("ns")
  const bindings = new Map();
  for (const m of code.matchAll(
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([\w.]+)"\s*\)/g,
  )) {
    bindings.set(m[1], m[2]);
  }
  if (bindings.size === 0) continue;

  for (const [varName, ns] of bindings) {
    const re = new RegExp(`(?<![\\w.])${varName}\\(\\s*"([\\w.]+)"`, "g");
    for (const m of code.matchAll(re)) {
      const key = `${ns}.${m[1]}`;
      checked++;
      for (const [locale, messages] of [["en", en], ["id", id]]) {
        try {
          const t = createTranslator({ locale, messages });
          const out = t(key, PARAMS);
          if (typeof out !== "string" || out.includes(key)) {
            console.error(`UNRESOLVED [${locale}] ${key}  (${path.relative(ROOT, file)})`);
            failed = true;
          }
        } catch (e) {
          console.error(`ERROR [${locale}] ${key}: ${e.message}  (${path.relative(ROOT, file)})`);
          failed = true;
        }
      }
    }
  }
}

if (failed) process.exit(1);
console.log(`i18n usage OK — ${checked} t() call sites resolve in en + id.`);
