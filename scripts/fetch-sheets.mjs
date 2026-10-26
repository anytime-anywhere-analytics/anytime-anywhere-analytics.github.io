/**
 * Pull site content from the Google Sheet CMS and write src/data/*.json.
 *
 *   node scripts/fetch-sheets.mjs                  # fail if not configured
 *   node scripts/fetch-sheets.mjs --if-configured  # skip quietly (used by `prebuild`)
 *   node scripts/fetch-sheets.mjs --force          # accept a tab that emptied or shrank a lot
 *
 * Reads CMS_URL and CMS_TOKEN from the environment or .env. Refuses to write a
 * list that is empty or lost more than half its rows, so a half-cleared sheet
 * fails the build instead of blanking the live site.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, configured, explainUnconfigured, callCms, FILES } from "./cms-env.mjs";

const ifConfigured = process.argv.includes("--if-configured");
const force = process.argv.includes("--force");

if (!configured) {
  explainUnconfigured();
  process.exit(ifConfigured ? 0 : 1);
}

let snapshot;
try { snapshot = await callCms(); }
catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
const { data, issues, generatedAt, version } = snapshot;
console.log(`Sheets CMS snapshot from ${generatedAt} (script v${version || "1 — redeploy cms/Code.gs"})`);

/* a missing required field would break a page at build time; everything else is advisory */
const structural = (issues || []).filter((i) => i.msg === "required");
const advisory = (issues || []).filter((i) => i.msg !== "required");
for (const i of advisory.slice(0, 40)) console.warn(`  ⚠ ${i.tab}${i.row ? " row " + i.row : ""} · ${i.key}: ${i.msg}`);
if (advisory.length > 40) console.warn(`  ⚠ … and ${advisory.length - 40} more`);

/* check every tab first; nothing is written unless all of them pass */
const problems = [];
const plan = [];
for (const name of FILES) {
  const next = data[name];
  const file = join(ROOT, "src/data", `${name}.json`);
  const prevText = await readFile(file, "utf8").catch(() => "");
  const prev = prevText ? JSON.parse(prevText) : null;
  if (next === undefined) { problems.push(`${name}: missing from the CMS response`); continue; }
  if (name === "site" ? typeof next !== "object" || Array.isArray(next) : !Array.isArray(next)) { problems.push(`${name}: wrong shape`); continue; }
  if (Array.isArray(next) && !force) {
    if (next.length === 0) { problems.push(`${name}: the tab is empty (pass --force to accept)`); continue; }
    if (Array.isArray(prev) && next.length < prev.length / 2) { problems.push(`${name}: ${prev.length} → ${next.length} rows (pass --force to accept)`); continue; }
  }
  plan.push({ name, file, next, prev, prevText });
}
for (const i of structural.slice(0, 20)) problems.push(`${i.tab}${i.row ? " row " + i.row : ""}: ${i.key} is required`);
if (structural.length > 20) problems.push(`… and ${structural.length - 20} more missing required fields`);

if (problems.length) {
  console.error("\nNothing written:\n  " + problems.join("\n  "));
  process.exit(1);
}

let changed = 0;
for (const { name, file, next, prev, prevText } of plan) {
  const text = JSON.stringify(next, null, 2) + "\n";
  if (text === prevText) { console.log(`  = ${name}.json unchanged`); continue; }
  await writeFile(file, text);
  changed++;
  console.log(`  ✓ ${name}.json ${Array.isArray(next) ? next.length + " rows" : "updated"}${Array.isArray(prev) && prev.length !== next.length ? ` (was ${prev.length})` : ""}`);
}
console.log(changed ? `\n${changed} file(s) updated` : "\nEverything already up to date");
