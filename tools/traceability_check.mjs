#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";

const findings = [];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const matrixPath = "docs/_quality/TRACEABILITY_MATRIX.md";
if (existsSync(matrixPath)) {
  const matrix = readFileSync(matrixPath, "utf8");
  for (const match of matrix.matchAll(/\((\.\.\/design\/detailed\/[0-9_a-z-]+\.md)\)/g)) {
    const ref = normalize(join("docs/_quality", match[1]));
    if (!existsSync(ref)) findings.push(`MISSING ref: ${match[1]}`);
  }
}

const registry = readFileSync("docs/design/detailed/19-error-code-registry.md", "utf8");
const allCodes = new Set();
for (const file of walk("docs/design/detailed").filter((path) => path.endsWith(".md"))) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/`([A-Z]+[A-Z0-9]*-[0-9]{3})`/g)) allCodes.add(match[1]);
}

for (const code of allCodes) {
  if (!registry.includes(code)) findings.push(`UNREGISTERED error: ${code}`);
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("traceability OK");
