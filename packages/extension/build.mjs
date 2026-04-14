#!/usr/bin/env node
/**
 * Zero-config bundler. Compiles TS content scripts + service worker via
 * esbuild and copies static assets (manifest.json, popup.html, icons).
 * Output goes to dist/ which is what you load in chrome://extensions.
 */
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: {
    "background/service-worker": "src/background/service-worker.ts",
    "popup": "src/background/popup.ts",
    "content-scripts/fanduel": "src/content-scripts/fanduel.ts",
    "content-scripts/draftkings": "src/content-scripts/draftkings.ts",
    "content-scripts/betmgm": "src/content-scripts/betmgm.ts",
    "content-scripts/caesars": "src/content-scripts/caesars.ts",
    "content-scripts/betrivers": "src/content-scripts/betrivers.ts",
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome120",
  platform: "browser",
  minify: false,
  sourcemap: true,
  logLevel: "info",
});

// Copy the static assets.
await cp("public", dist, { recursive: true });
console.log("\n✔ extension built → dist/");
