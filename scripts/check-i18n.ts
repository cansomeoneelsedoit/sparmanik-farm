/**
 * i18n catalogue checker — keeps en.json and id.json honest.
 *
 *   npm run check:i18n
 *
 * Fails (exit 1) when:
 *   - a key exists in one locale but not the other
 *   - a message's {placeholders} differ between locales (catches the
 *     classic "translated the text, dropped the {count}" bug)
 */
import en from "../src/i18n/messages/en.json";
import id from "../src/i18n/messages/id.json";

type Tree = { [key: string]: string | Tree };

function flatten(obj: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out.set(`${prefix}${k}`, v);
    else for (const [ck, cv] of flatten(v, `${prefix}${k}.`)) out.set(ck, cv);
  }
  return out;
}

/** Top-level ICU argument names: "{count, plural, …}" and "{name}" → count, name. */
function placeholders(msg: string): Set<string> {
  const out = new Set<string>();
  for (const m of msg.matchAll(/\{(\w+)\s*[,}]/g)) out.add(m[1]);
  return out;
}

const enFlat = flatten(en as Tree);
const idFlat = flatten(id as Tree);

let failed = false;

for (const key of enFlat.keys()) {
  if (!idFlat.has(key)) {
    console.error(`MISSING in id.json: ${key}`);
    failed = true;
  }
}
for (const key of idFlat.keys()) {
  if (!enFlat.has(key)) {
    console.error(`MISSING in en.json: ${key}`);
    failed = true;
  }
}

for (const [key, enMsg] of enFlat) {
  const idMsg = idFlat.get(key);
  if (idMsg === undefined) continue;
  const a = [...placeholders(enMsg)].sort().join(",");
  const b = [...placeholders(idMsg)].sort().join(",");
  if (a !== b) {
    console.error(
      `PLACEHOLDER mismatch at ${key}: en has [${a}] but id has [${b}]`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log(
    `i18n OK — ${enFlat.size} keys, en/id in sync, placeholders match.`,
  );
}
