import { readFileSync } from "node:fs";
const src = readFileSync("public/farm-legacy.js", "utf-8");
const start = src.indexOf("var S = {");
const close = src.indexOf("\n};\n", start);
console.log("start=", start, "close=", close);
console.log("first 100 chars at start:", JSON.stringify(src.slice(start, start + 60)));
console.log("close marker bytes:", close >= 0 ? JSON.stringify(src.slice(close, close + 6)) : "NOT FOUND");
