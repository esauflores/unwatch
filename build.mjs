import { cp, rm } from "node:fs/promises";
import * as esbuild from "esbuild";

const outdir = "dist";
const watch = process.argv.includes("--watch");

await rm(outdir, { recursive: true, force: true });
const assets = ["manifest.json", "styles.css", "sidepanel.html", "library.html", "chat.html"];
for (const s of [16, 32, 48, 128]) assets.push(`icon-${s}.png`);
for (const f of assets) {
  await cp(`src/${f}`, `${outdir}/${f}`);
}

const ctx = await esbuild.context({
  entryPoints: ["src/background.ts", "src/content.ts", "src/sidepanel.ts", "src/library.ts", "src/chat.ts"],
  outdir,
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
