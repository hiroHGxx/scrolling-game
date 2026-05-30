import { defineConfig } from "vite";

// GitHub Pages project site is served from /<repo>/, so assets must use that base.
// Override with BASE_PATH env if deploying elsewhere (e.g. "/" for a custom domain).
const base = process.env.BASE_PATH ?? "/scrolling-game/";

export default defineConfig({
  base,
  build: {
    outDir: "dist",
    assetsInlineLimit: 0, // keep generated PNGs as real files
    target: "es2020",
  },
});
