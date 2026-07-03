#!/usr/bin/env node
/**
 * Signature ed25519 d'un build de connecteur.
 *
 * Payload signé : sha256hex(manifest.json) + "\n" + sha256hex(bundle.mjs).
 *
 * Usage :
 *   CONNECTOR_SIGNING_KEY=~/.chorus-pay/connector-signing.pem \
 *     node scripts/connector/sign.mjs <dossier-dist>
 *
 *   node scripts/connector/sign.mjs --generate-keypair   # génère une paire de clés
 *
 * La clé privée ne doit JAMAIS être commitée (gitignore *.connector-key,
 * *.pem hors repo). La clé publique (base64 DER/SPKI, affichée à la
 * génération) va dans l'env CONNECTOR_TRUSTED_PUBLIC_KEYS du serveur.
 */
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import AdmZip from "adm-zip";

function sha256hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const privPem = privateKey.export({ format: "pem", type: "pkcs8" });
  const pubDerB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const keyPath = path.join(os.homedir(), ".chorus-pay-connector-signing.pem");
  await fs.writeFile(keyPath, privPem, { mode: 0o600 });

  console.log(`✓ Clé privée écrite : ${keyPath} (chmod 600 — à sauvegarder hors machine)`);
  console.log(`\nClé publique (à ajouter à CONNECTOR_TRUSTED_PUBLIC_KEYS) :\n${pubDerB64}\n`);
  console.log(`Pour signer : CONNECTOR_SIGNING_KEY=${keyPath} node scripts/connector/sign.mjs <dist>`);
}

async function main() {
  if (process.argv.includes("--generate-keypair")) {
    await generateKeypair();
    return;
  }

  const dist = process.argv[2];
  if (!dist) {
    console.error("Usage: node scripts/connector/sign.mjs <dossier-dist> | --generate-keypair");
    process.exit(1);
  }

  const keyPath = process.env.CONNECTOR_SIGNING_KEY;
  if (!keyPath) {
    console.error("CONNECTOR_SIGNING_KEY doit pointer vers la clé privée ed25519 (PEM)");
    process.exit(1);
  }

  const privateKey = crypto.createPrivateKey(
    await fs.readFile(keyPath.replace(/^~\//, `${os.homedir()}/`), "utf8")
  );

  const manifestJson = await fs.readFile(path.join(dist, "manifest.json"));
  const bundle = await fs.readFile(path.join(dist, "bundle.mjs"));
  const payload = Buffer.from(`${sha256hex(manifestJson)}\n${sha256hex(bundle)}`, "utf8");
  const signature = crypto.sign(null, payload, privateKey).toString("base64");

  await fs.writeFile(path.join(dist, "signature.b64"), signature);

  // Mettre à jour le zip s'il existe (ajoute/remplace signature.b64)
  const manifest = JSON.parse(manifestJson.toString("utf8"));
  const zipPath = path.join(dist, `${manifest.id}-${manifest.version}.zip`);
  try {
    const zip = new AdmZip(zipPath);
    zip.deleteFile("signature.b64");
    zip.addFile("signature.b64", Buffer.from(signature, "utf8"));
    zip.writeZip(zipPath);
    console.log(`✓ zip signé : ${zipPath}`);
  } catch {
    console.log("(pas de zip à mettre à jour — signature.b64 écrite dans dist/)");
  }

  console.log(`✓ signature : ${signature.slice(0, 32)}…`);
  console.log(`  content_hash : ${sha256hex(bundle)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
