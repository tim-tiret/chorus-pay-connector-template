#!/usr/bin/env node
/**
 * Build du connecteur → bundle ESM auto-suffisant + manifest.json + zip.
 *
 * Usage : npm run build   (produit dist/<id>-<version>.zip)
 * La signature est une étape séparée (npm run sign) réalisée par Chorus Pay.
 */
import { build } from "esbuild";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { createHash } from "crypto";
import AdmZip from "adm-zip";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const entry = path.join(repoRoot, "index.ts");
  const out = path.join(repoRoot, "dist");
  await fs.mkdir(out, { recursive: true });

  const bundlePath = path.join(out, "bundle.mjs");
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    outfile: bundlePath,
    tsconfig: path.join(repoRoot, "tsconfig.json"),
    logLevel: "warning",
  });

  const mod = await import(pathToFileURL(bundlePath).href);
  const def = mod.default;
  if (!def?.manifest) {
    console.error("Le bundle n'exporte pas un connecteur (export default defineConnector)");
    process.exit(1);
  }
  const cron = {};
  for (const [name, job] of Object.entries(def.cron ?? {})) {
    cron[name] = { every: job.every, ...(job.timeoutMs ? { timeoutMs: job.timeoutMs } : {}) };
  }
  const defineSrc = await fs.readFile(path.join(repoRoot, "sdk/define.ts"), "utf8");
  const sdkVersion = defineSrc.match(/SDK_VERSION = "([^"]+)"/)?.[1] ?? "1.0.0";
  const manifestJson = Buffer.from(
    JSON.stringify(
      { ...def.manifest, ...(Object.keys(cron).length > 0 ? { cron } : {}), sdkVersion },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(path.join(out, "manifest.json"), manifestJson);

  const bundle = await fs.readFile(bundlePath);
  const contentHash = createHash("sha256").update(bundle).digest("hex");

  const zip = new AdmZip();
  zip.addFile("manifest.json", manifestJson);
  zip.addFile("bundle.mjs", bundle);
  try {
    zip.addFile("CHANGELOG.md", await fs.readFile(path.join(repoRoot, "CHANGELOG.md")));
  } catch {
    // changelog optionnel
  }
  try {
    zip.addFile("signature.b64", await fs.readFile(path.join(out, "signature.b64")));
    console.log("signature.b64 existante incluse dans le zip");
  } catch {
    console.log("⚠ zip NON signé — la signature est apposée par Chorus Pay à la publication");
  }

  const zipPath = path.join(out, `${def.manifest.id}-${def.manifest.version}.zip`);
  await fs.writeFile(zipPath, zip.toBuffer());

  console.log(`✓ ${def.manifest.id}@${def.manifest.version}`);
  console.log(`  content_hash : ${contentHash}`);
  console.log(`  zip          : ${zipPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
