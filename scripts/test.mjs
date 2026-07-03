#!/usr/bin/env node
/**
 * Kit de conformité : vérifie que le connecteur respecte le protocole
 * Chorus Pay (sans base de données ni réseau).
 *
 * Usage : npm test
 */
import { spawnSync } from "child_process";
import { writeFileSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Le runner est écrit DANS le repo (et non dans /tmp) pour que la résolution
// de node_modules (@chorus-pay/*) fonctionne comme pour n'importe quel import.
const runnerPath = path.join(repoRoot, ".conformance-runner.mts");
const runner = `
import connector from "./index.ts";
import { runConformance } from "@chorus-pay/connector-testkit";

const report = await runConformance(connector);
console.log(\`\${report.ok ? "✅" : "❌"} \${report.connector}\`);
for (const issue of report.issues) {
  console.log(\`   \${issue.level === "error" ? "✗" : "⚠"} [\${issue.check}] \${issue.message}\`);
}
if (!report.ok) process.exit(1);
`;

writeFileSync(runnerPath, runner);
try {
  const result = spawnSync("npx", ["tsx", runnerPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(runnerPath, { force: true });
}
