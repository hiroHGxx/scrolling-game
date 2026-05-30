// Renders every game sprite/background to a PNG under public/assets/.
//
// The draw functions live in scripts/asset-fns.json (each is the BODY of a
// function with (ctx, W, H, P) in scope). They were authored once and committed,
// so `npm run gen:assets` is fully reproducible and needs no network / model.
//
// Usage: node scripts/generate-assets.mjs

import { createCanvas } from "@napi-rs/canvas";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "public", "assets");

const palette = JSON.parse(await readFile(join(root, "src", "game", "palette.json"), "utf8"));
const assets = JSON.parse(await readFile(join(root, "scripts", "asset-fns.json"), "utf8"));

await mkdir(OUT_DIR, { recursive: true });

let ok = 0;
const failures = [];

for (const a of assets) {
  const canvas = createCanvas(a.w, a.h);
  const ctx = canvas.getContext("2d");
  try {
    // Compile the draw body with (ctx, W, H, P) in scope and run it.
    const draw = new Function("ctx", "W", "H", "P", a.code);
    draw(ctx, a.w, a.h, palette);
    const buf = canvas.toBuffer("image/png");
    await writeFile(join(OUT_DIR, a.file), buf);
    ok++;
    console.log(`  ✓ ${a.file.padEnd(26)} ${a.w}x${a.h}  ${(buf.length / 1024).toFixed(1)}kb`);
  } catch (err) {
    failures.push({ file: a.file, message: String(err && err.message ? err.message : err) });
    console.error(`  ✗ ${a.file.padEnd(26)} ${err && err.message ? err.message : err}`);
  }
}

console.log(`\nGenerated ${ok}/${assets.length} assets into public/assets/`);
if (failures.length) {
  console.error("Failures:");
  for (const f of failures) console.error(`  - ${f.file}: ${f.message}`);
  process.exit(1);
}
