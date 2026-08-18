/**
 * Deterministic parser for the Sparmanik "SOP Melon Book" PDFs (EN + ID).
 * Two things come out of the extracted text:
 *   1. the day-by-day schedule (HST → stage, EC, ppm, SOP g/tank, water per
 *      polybag, pulses, times, job for the day) — regex over the table rows,
 *      so every number is exactly what the book says;
 *   2. the pages as sections (heading = first line) so the booklet reads in
 *      the SOP viewer with the EN/ID toggle.
 * The EN and ID books are laid out identically, so a row parsed from each is
 * matched by HST and a page from each is matched by index.
 */

export type SopDayRow = {
  day: number;
  stage: string;
  ec: number | null;
  ppm: number | null;
  /** "310 g" style, or null when the row shows "—". */
  sopPerTank: string | null;
  waterMl: number | null;
  /** "4 × 6m" */
  pulses: string | null;
  /** "8 · 11am · 2 · 5pm" */
  times: string | null;
  job: string | null;
};

const STAGES = "GROW|FLOWER|SIZING|RIPEN|TUMBUH|BUNGA|PEMBESARAN|MATANG|BESAR|PEMATANGAN";
const ROW_RE = new RegExp(
  `^(\\d{1,2})\\s+(${STAGES})\\s+(\\d{3,4})\\s+(\\d{3,4})\\s+(—|-|\\d+\\s*g)\\s+(\\d{2,4})\\s+(\\d+\\s*×\\s*\\d+\\s*m)\\s*(.*)$`,
  "i",
);
const TIME_TOKEN = /^\d{1,2}(:\d{2})?(am|pm)?$/i;

/** "EC PPM SOP WATER PULSES" as one line, spaced ("2100 1050 — 500 3 × 5m")
 *  or glued by the extractor ("21001050—5003 × 5m"). */
const NUMS_RE = /^(\d{3,4})\s*(\d{3,4})\s*(—|-|\d+\s*g)\s*(\d{3,4})\s*(\d)\s*×\s*(\d+)\s*m\s*(.*)$/i;
const STAGE_RE = new RegExp(`^(${STAGES})$`, "i");

/** Split "8am · 12pm · 4pm TRANSPLANT + …" into times + job. Times are the
 *  leading time-ish tokens joined by ·; the job may be glued to the last one. */
function splitTimesJob(tail: string): { times: string | null; job: string } {
  const parts = tail.trim().split(/\s*·\s*/);
  const times: string[] = [];
  let jobStart = -1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    const first = p.split(/\s+/)[0] ?? "";
    // "5pmSilicon" — time glued to the job with no space.
    const glued = /^(\d{1,2}(?::\d{2})?(?:am|pm)?)([A-Za-z].*)$/.exec(p);
    if (TIME_TOKEN.test(first)) {
      times.push(first);
      const rest = p.slice(first.length).trim();
      if (rest) {
        jobStart = i;
        parts[i] = rest;
        break;
      }
    } else if (glued && TIME_TOKEN.test(glued[1])) {
      times.push(glued[1]);
      jobStart = i;
      parts[i] = glued[2].trim();
      break;
    } else {
      jobStart = i;
      break;
    }
  }
  const job = jobStart >= 0 ? parts.slice(jobStart).join(" · ").trim() : "";
  return { times: times.length ? times.join(" · ") : null, job };
}

/**
 * Pull every day row out of the booklet text. Handles both layouts:
 *  - one row per line: "8 GROW 2100 1050 — 800 4 × 6m 8 · 11am · 2 · 5pm Silicon drench…"
 *  - one row over several lines (pdf-parse): "8" / "GROW" / "2100 1050 — 800 4 × 6m" / "8 · 11am … Silicon…" (+ wrapped job lines)
 * Duplicates keep the first occurrence.
 */
export function parseSopDays(text: string): SopDayRow[] {
  const out = new Map<number, SopDayRow>();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, " ").trim());
  const put = (row: SopDayRow) => {
    if (!out.has(row.day)) out.set(row.day, row);
  };
  const isRowStart = (i: number) => /^\d{1,2}$/.test(lines[i] ?? "") && STAGE_RE.test(lines[i + 1] ?? "");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Layout A — single line.
    const m = ROW_RE.exec(line);
    if (m) {
      const { times, job } = splitTimesJob(m[8]);
      put({
        day: Number(m[1]),
        stage: m[2].toUpperCase(),
        ec: Number(m[3]),
        ppm: Number(m[4]),
        sopPerTank: /^\d/.test(m[5]) ? m[5].replace(/\s+/g, " ") : null,
        waterMl: Number(m[6]),
        pulses: m[7].replace(/\s+/g, " "),
        times,
        job: job || null,
      });
      continue;
    }
    // Layout B — day / stage / numbers / times+job (job may wrap onto more lines).
    if (isRowStart(i)) {
      const nm = NUMS_RE.exec(lines[i + 2] ?? "");
      if (!nm) continue;
      const day = Number(line);
      const stage = lines[i + 1].toUpperCase();
      let tail = (nm[7] ?? "").trim();
      let j = i + 3;
      const jobLines: string[] = [];
      while (
        j < lines.length &&
        !isRowStart(j) &&
        lines[j] !== "" &&
        !/^(HST|pH|Check|Silicon stops|Cek|Periksa|\f)/i.test(lines[j]) &&
        jobLines.length < 4
      ) {
        jobLines.push(lines[j]);
        j++;
      }
      tail = [tail, ...jobLines].filter(Boolean).join(" ").trim();
      const { times, job } = splitTimesJob(tail);
      put({
        day,
        stage,
        ec: Number(nm[1]),
        ppm: Number(nm[2]),
        sopPerTank: /^\d/.test(nm[3]) ? nm[3].replace(/\s+/g, " ") : null,
        waterMl: Number(nm[4]),
        pulses: `${nm[5]} × ${nm[6]}m`,
        times,
        job: job || null,
      });
      i = j - 1;
    }
  }
  return [...out.values()].sort((a, b) => a.day - b.day);
}

export type SopPageSection = { heading: string; body: string };

/** Split extracted text into pages (our extractor inserts "===== PAGE n =====",
 *  pdf-parse inserts form-feeds) and turn each into a heading + body. Pages
 *  with fewer than ~40 characters (blank / picture-only) are dropped. */
export function parseSopPages(text: string): SopPageSection[] {
  const chunks = text.includes("===== PAGE")
    ? text.split(/=====\s*PAGE\s+\d+\s*=====/)
    : text.split(/\f/);
  const out: SopPageSection[] = [];
  for (const c of chunks) {
    const lines = c
      .split(/\r?\n/)
      .map((l) => l.replace(/ /g, " ").trimEnd())
      .filter((l, i, arr) => !(l.trim() === "" && (i === 0 || arr[i - 1].trim() === "")));
    while (lines.length && lines[0].trim() === "") lines.shift();
    const body = lines.join("\n").trim();
    if (body.length < 40) continue;
    const heading = (lines[0] ?? "").trim().slice(0, 120) || "Section";
    out.push({ heading, body });
  }
  return out;
}

/** Best-effort title: the first real line of page 1 — skipping letter-spaced
 *  banner text like "S PARMAN IK FARM · S TAGE-BY-S TAGE" that PDF extraction
 *  produces from tracked-out headings. */
export function guessSopTitle(text: string, fallback: string): string {
  const first = parseSopPages(text)[0];
  if (!first) return fallback;
  const lines = first.body.split("\n").map((l) => l.trim()).filter((l) => l.length > 6);
  const spaced = (l: string) => l.split(/\s+/).filter((t) => t.length === 1).length >= 3;
  const good = lines.filter((l) => !spaced(l));
  // Prefer joining the first two short lines when they read like "Sparmanik Premium" + "Melon Book".
  if (good.length >= 2 && good[0].length + good[1].length < 60 && !/[.:!?]$/.test(good[0])) {
    return `${good[0]} ${good[1]}`.slice(0, 140);
  }
  return (good[0] ?? lines[0] ?? fallback).slice(0, 140);
}
