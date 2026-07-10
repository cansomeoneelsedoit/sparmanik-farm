import { promises as fs } from "node:fs";
import path from "node:path";

import AdmZip from "adm-zip";

/**
 * SCORM 1.2 package handling — extraction to the uploads area + a light
 * imsmanifest.xml parse to find the launch href.
 *
 * Storage layout (same UPLOAD_DIR convention as src/server/uploads.ts, so it
 * works on Railway where UPLOAD_DIR points at the mounted volume):
 *   <UPLOAD_DIR>/scorm/<moduleId>/...extracted package files...
 * The Module row stores "<moduleId>|<launchHref>" in `scormPath`; files are
 * served auth-gated via /api/scorm/[moduleId]/[...path].
 *
 * The manifest parse is deliberately regex/string based (SCORM 1.2 only):
 * default organization → first item with an identifierref → that resource's
 * href. Fallbacks: first resource with adlcp:scormtype="sco", then the first
 * resource with an href at all.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/** Sanity caps so a hostile zip can't fill the disk (zip-bomb guard). */
const MAX_UNCOMPRESSED_BYTES = 800 * 1024 * 1024; // 800 MB extracted
const MAX_ENTRIES = 10_000;

/** Module ids are cuids — keep path joins safe by refusing anything else. */
function assertSafeModuleId(moduleId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(moduleId)) throw new Error("Invalid module id");
}

/** Absolute directory a module's extracted SCORM package lives in. */
export function scormDirFor(moduleId: string): string {
  assertSafeModuleId(moduleId);
  return path.join(UPLOAD_DIR, "scorm", moduleId);
}

/**
 * Resolve a relative file path inside a module's SCORM dir, throwing if the
 * path tries to escape it (../, absolute paths, drive letters, NUL bytes).
 * Used by the /api/scorm serving route.
 */
export function resolveScormFile(moduleId: string, relativePath: string): string {
  const base = scormDirFor(moduleId);
  if (relativePath.includes("\0")) throw new Error("Invalid path");
  // Drop "." (current-dir) segments — a manifest href of "./index.html" is
  // valid and common; only ".." (escape), absolute paths and drive letters
  // are rejected.
  const segments = relativePath.split(/[/\\]+/).filter((s) => s && s !== ".");
  if (segments.length === 0) throw new Error("Invalid path");
  for (const seg of segments) {
    if (seg === ".." || /^[A-Za-z]:$/.test(seg)) throw new Error("Invalid path");
  }
  const resolved = path.resolve(base, segments.join(path.sep));
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

/** First capture group of `re` in `text`, or null. */
function match1(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] ?? null;
}

/** Read one attribute off an XML tag string, tolerant of quote style. */
function attr(tag: string, name: string): string | null {
  return match1(tag, new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i")) ??
    match1(tag, new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"));
}

/** Minimal XML entity decode for href values pulled out with regexes. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse a SCORM 1.2 imsmanifest.xml (as text) and return the launch href.
 *
 * Resolution order:
 * 1. <organizations default="X"> → <organization identifier="X"> → first
 *    <item ... identifierref="Y"> → <resource identifier="Y" href="...">
 * 2. Any organization's first item identifierref → its resource href
 * 3. First <resource ... adlcp:scormtype="sco" ... href="...">
 * 4. First <resource ... href="...">
 *
 * A resource's xml:base (rare) is prepended when present. Exported for
 * testability; extractScormPackage is the normal entry point.
 */
export function parseScormManifest(xml: string): string | null {
  // Collect every <resource ...> opening tag once.
  const resourceTags = xml.match(/<resource\b[^>]*>/gi) ?? [];
  const resources = resourceTags.map((tag) => ({
    identifier: attr(tag, "identifier"),
    href: attr(tag, "href"),
    scormType: attr(tag, "adlcp:scormtype") ?? attr(tag, "adlcp:scormType") ?? attr(tag, "scormtype"),
    base: attr(tag, "xml:base"),
  }));

  const hrefFor = (identifierref: string | null): string | null => {
    if (!identifierref) return null;
    const r = resources.find((res) => res.identifier === identifierref);
    if (!r?.href) return null;
    return decodeEntities((r.base ?? "") + r.href);
  };

  // 1+2. Walk organizations, preferring the default one.
  const defaultOrg = match1(xml, /<organizations\b[^>]*\bdefault\s*=\s*["']([^"']+)["']/i);
  const orgBlocks = xml.match(/<organization\b[\s\S]*?<\/organization>/gi) ?? [];
  const orderedOrgs = [...orgBlocks].sort((a, b) => {
    if (!defaultOrg) return 0;
    const aIsDefault = attr(a.slice(0, a.indexOf(">") + 1), "identifier") === defaultOrg;
    const bIsDefault = attr(b.slice(0, b.indexOf(">") + 1), "identifier") === defaultOrg;
    return (bIsDefault ? 1 : 0) - (aIsDefault ? 1 : 0);
  });
  for (const org of orderedOrgs) {
    const itemTags = org.match(/<item\b[^>]*>/gi) ?? [];
    for (const item of itemTags) {
      const href = hrefFor(attr(item, "identifierref"));
      if (href) return href;
    }
  }

  // 3. First SCO resource with an href.
  const sco = resources.find((r) => r.scormType?.toLowerCase() === "sco" && r.href);
  if (sco?.href) return decodeEntities((sco.base ?? "") + sco.href);

  // 4. Anything launchable at all.
  const any = resources.find((r) => r.href);
  return any?.href ? decodeEntities((any.base ?? "") + any.href) : null;
}

export type ScormExtractResult = {
  /** Launch file, relative to the module's scorm dir (forward slashes). */
  launchHref: string;
  fileCount: number;
};

/**
 * Extract an uploaded SCORM 1.2 zip into <UPLOAD_DIR>/scorm/<moduleId>/,
 * wiping any previous package for the module first, and return the launch
 * href parsed from imsmanifest.xml.
 *
 * Rejects zips without an imsmanifest.xml. If the manifest sits inside a
 * wrapper folder (a common authoring-tool mistake), that folder becomes part
 * of the launch href so the package still plays without re-zipping.
 *
 * Every entry is path-checked before writing — entries with "..", absolute
 * paths, or drive letters are rejected outright (the whole upload fails, so
 * a hostile zip never lands half-extracted).
 */
export async function extractScormPackage(
  moduleId: string,
  zipBuffer: Buffer,
): Promise<ScormExtractResult> {
  const dir = scormDirFor(moduleId);

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new Error("That file doesn't look like a valid .zip archive");
  }
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) throw new Error("The zip archive is empty");
  if (entries.length > MAX_ENTRIES) throw new Error("The zip archive has too many files");

  // Locate the manifest — root level preferred, shallowest match otherwise
  // (wrapper-folder zips). Its directory becomes the package root prefix.
  const manifestEntry = entries
    .filter((e) => /(^|[/\\])imsmanifest\.xml$/i.test(e.entryName))
    .sort((a, b) => a.entryName.split(/[/\\]/).length - b.entryName.split(/[/\\]/).length)[0];
  if (!manifestEntry) {
    throw new Error("Not a SCORM package — no imsmanifest.xml found in the zip");
  }
  const prefix = manifestEntry.entryName.replace(/[^/\\]*$/, ""); // "" or "folder/"

  // Validate every entry BEFORE touching the existing package on disk.
  let totalBytes = 0;
  const writes: { target: string; entry: AdmZip.IZipEntry }[] = [];
  for (const entry of entries) {
    const name = entry.entryName;
    if (name.includes("\0")) throw new Error("Unsafe file path in zip");
    const segments = name.split(/[/\\]+/).filter(Boolean);
    if (
      segments.length === 0 ||
      /^[/\\]/.test(name) ||
      segments.some((s) => s === ".." || /^[A-Za-z]:$/.test(s))
    ) {
      throw new Error("Unsafe file path in zip");
    }
    const target = path.resolve(dir, segments.join(path.sep));
    if (target !== dir && !target.startsWith(dir + path.sep)) {
      throw new Error("Unsafe file path in zip");
    }
    totalBytes += entry.header.size;
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("The package is too large once extracted (max 800 MB)");
    }
    writes.push({ target, entry });
  }

  const manifestXml = manifestEntry.getData().toString("utf8");
  const rawHref = parseScormManifest(manifestXml);
  if (!rawHref) {
    throw new Error("Couldn't find a launch file in imsmanifest.xml");
  }
  // Keep any query string / fragment on the href for the iframe URL, but
  // normalize the FILE part (drop "." segments — "./index.html" is valid) and
  // make sure it actually resolves inside the package.
  const qIndex = rawHref.search(/[?#]/);
  const hrefFile = qIndex === -1 ? rawHref : rawHref.slice(0, qIndex);
  const suffix = qIndex === -1 ? "" : rawHref.slice(qIndex);
  const launchFile = (prefix + hrefFile)
    .split(/[/\\]+/)
    .filter((s) => s && s !== ".")
    .join("/");
  const launchHref = launchFile + suffix;
  resolveScormFile(moduleId, launchFile); // throws on traversal attempts

  // Wipe the previous package, then write the validated entries.
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  for (const w of writes) {
    await fs.mkdir(path.dirname(w.target), { recursive: true });
    await fs.writeFile(w.target, w.entry.getData());
  }

  return { launchHref, fileCount: writes.length };
}

/** Delete a module's extracted SCORM package (no-op if none exists). */
export async function removeScormPackage(moduleId: string): Promise<void> {
  const dir = scormDirFor(moduleId);
  await fs.rm(dir, { recursive: true, force: true });
}
