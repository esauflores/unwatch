import { cp, rm } from "node:fs/promises";
import { basename } from "node:path";

import * as esbuild from "esbuild";

const outdir = "dist";
const watch = process.argv.includes("--watch");

await rm(outdir, { recursive: true, force: true });
const assets = ["manifest.json", "styles.css", "pages/sidepanel.html"];
for (const s of [16, 32, 48, 128]) assets.push(`icon-${s}.png`);
for (const f of assets) {
  await cp(`src/${f}`, `${outdir}/${basename(f)}`);
}

const ctx = await esbuild.context({
  entryPoints: ["src/pages/background.ts", "src/pages/content.ts", "src/pages/sidepanel.ts"],
  outdir,
  outbase: "src/pages",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: !watch,
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
  console.log("watching src/ … (html/css/manifest are copied once at start)");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
