import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcPath =
  process.argv[2] || path.join(root, "sparmanik-farm-preview.html");

const s = fs.readFileSync(srcPath, "utf8");
const styleOpen = s.indexOf("<style>");
const styleClose = s.indexOf("</style>");
if (styleOpen < 0 || styleClose < 0) throw new Error("Could not find <style>");
const css = s.slice(styleOpen + "<style>".length, styleClose).trim();

const scriptOpen = s.indexOf("<script>", styleClose);
const scriptClose = s.lastIndexOf("</script>");
if (scriptOpen < 0 || scriptClose < 0) throw new Error("Could not find <script>");
const js = s.slice(scriptOpen + "<script>".length, scriptClose).trim();

fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.writeFileSync(path.join(root, "src/app/globals.css"), css);
fs.writeFileSync(path.join(root, "public/farm-legacy.js"), js);
console.log("Wrote globals.css bytes:", css.length, "farm-legacy.js bytes:", js.length);
