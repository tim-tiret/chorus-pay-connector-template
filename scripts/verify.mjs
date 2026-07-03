#!/usr/bin/env node
/**
 * Vérifie un zip de connecteur : structure, hash, signature ed25519.
 *
 * Usage :
 *   CONNECTOR_TRUSTED_PUBLIC_KEYS=<b64[,b64...]> node scripts/connector/verify.mjs <zip>
 */
import { promises as fs } from "fs";
import crypto from "crypto";
import AdmZip from "adm-zip";

function sha256hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error("Usage: node scripts/connector/verify.mjs <zip>");
    process.exit(1);
  }

  const zip = new AdmZip(await fs.readFile(zipPath));
  const read = (name) => zip.getEntry(name)?.getData() ?? null;

  const manifestJson = read("manifest.json");
  const bundle = read("bundle.mjs");
  const signature = read("signature.b64");

  if (!manifestJson || !bundle) {
    console.error("✗ zip invalide : manifest.json et bundle.mjs requis");
    process.exit(1);
  }
  const manifest = JSON.parse(manifestJson.toString("utf8"));
  console.log(`connecteur    : ${manifest.id}@${manifest.version} (${manifest.category})`);
  console.log(`content_hash  : ${sha256hex(bundle)}`);

  if (!signature) {
    console.error("✗ non signé (signature.b64 absente)");
    process.exit(1);
  }

  const keys = (process.env.CONNECTOR_TRUSTED_PUBLIC_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((b64) =>
      crypto.createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" })
    );
  if (keys.length === 0) {
    console.error("✗ CONNECTOR_TRUSTED_PUBLIC_KEYS non configurée");
    process.exit(1);
  }

  const payload = Buffer.from(
    `${sha256hex(manifestJson)}\n${sha256hex(bundle)}`,
    "utf8"
  );
  const ok = keys.some((key) => {
    try {
      return crypto.verify(null, payload, key, Buffer.from(signature.toString("utf8").trim(), "base64"));
    } catch {
      return false;
    }
  });

  if (!ok) {
    console.error("✗ signature invalide");
    process.exit(1);
  }
  console.log("✓ signature valide");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
