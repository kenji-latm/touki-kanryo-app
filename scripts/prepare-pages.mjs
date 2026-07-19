import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "app");
const output = resolve(root, "_site");
const agetena = resolve(output, "agetena");

const agetenaFiles = [
  "index.html",
  "privacy.html",
  "styles.css",
  "app.js",
  "shared-config.js",
  "sw.js",
  "manifest.webmanifest",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon.svg",
  "data",
];

await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });
await mkdir(agetena, { recursive: true });

for (const item of agetenaFiles) {
  await cp(resolve(source, item), resolve(agetena, item), { recursive: true });
}

console.log("GitHub Pages output prepared: / and /agetena/");
