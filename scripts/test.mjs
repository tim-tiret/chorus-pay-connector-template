#!/usr/bin/env node
/**
 * Kit de conformité : vérifie que le connecteur respecte le protocole
 * Chorus Pay (sans base de données ni réseau).
 *
 * Usage : npm test
 */
import { spawnSync } from "child_process";
import { writeFileSync, mkdtempSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const runner = `
import connector from "${pathForImport(path.join(repoRoot, "index.ts"))}";
import { runConformance } from "@/lib/connector-testkit";

async function main() {
  const report = await runConformance(connector);
  console.log(\`\${report.ok ? "✅" : "❌"} \${report.connector}\`);
  for (const issue of report.issues) {
    console.log(\`   \${issue.level === "error" ? "✗" : "⚠"} [\${issue.check}] \${issue.message}\`);
  }
  if (!report.ok) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
`;

function pathForImport(p) {
  return "file://" + p.replace(/\\/g, "/");
}

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "connector-test-"));
const runnerPath = path.join(tmpDir, "runner.ts");
writeFileSync(runnerPath, runner);

const result = spawnSync(
  "npx",
  ["tsx", "--tsconfig", path.join(repoRoot, "tsconfig.json"), runnerPath],
  { cwd: repoRoot, stdio: "inherit" }
);
process.exit(result.status ?? 1);
