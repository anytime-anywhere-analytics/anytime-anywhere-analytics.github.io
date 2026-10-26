/**
 * Push local src/data/<name>.json files into the Google Sheet (upsert by id).
 * Used after `npm run sync:pure` so the sheet — the source of truth on rebuild —
 * learns about new Pure records without losing the curation typed into it,
 * and with --replace to seed the sheet from the checked-in files.
 *
 *   node scripts/push-sheets.mjs publications
 *   node scripts/push-sheets.mjs members posts --if-configured
 *   node scripts/push-sheets.mjs --all --replace     # overwrite every tab with the local files
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, configured, explainUnconfigured, callCms, TAB_OF } from "./cms-env.mjs";

/* sheet cells in these columns win over the incoming value when they are non-empty */
const PRESERVE = { publications: ["pillar", "testbed", "featured", "hook", "image", "video", "pdf"] };
const CHUNK = 40;

const ifConfigured = process.argv.includes("--if-configured");
const replace = process.argv.includes("--replace");
const names = process.argv.includes("--all") ? Object.keys(TAB_OF) : process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!names.length) names.push("publications");

if (!configured) { explainUnconfigured(); process.exit(ifConfigured ? 0 : 1); }

const post = async (payload) => {
  let r;
  try { r = await callCms({ method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ token: process.env.CMS_TOKEN, ...payload }) }); }
  catch (e) { console.error(`\n✗ ${e.message}`); process.exit(1); }
  if (typeof r.added !== "number") { console.error(`\n✗ unexpected response from the CMS: ${JSON.stringify(r).slice(0, 200)}`); process.exit(1); }
  return r;
};

for (const name of names) {
  const tab = TAB_OF[name];
  if (!tab) { console.error(`cannot push "${name}" — one of: ${Object.keys(TAB_OF).join(", ")}`); process.exit(1); }
  const data = JSON.parse(await readFile(join(ROOT, "src/data", `${name}.json`), "utf8"));
  if (name === "site") {
    const r = await post({ tab, rows: data });
    console.log(`  ✓ ${tab}: ${r.updated} fields written`);
    continue;
  }
  let added = 0, updated = 0;
  if (replace) {
    // one shot: the tab is cleared and rewritten in a single call
    const r = await post({ tab, rows: data, replace: true });
    added = r.added;
  } else {
    for (let i = 0; i < data.length; i += CHUNK) {
      const r = await post({ tab, rows: data.slice(i, i + CHUNK), preserve: PRESERVE[name] || [] });
      added += r.added; updated += r.updated;
      process.stdout.write(`\r  ${tab}: ${Math.min(i + CHUNK, data.length)}/${data.length}`);
    }
    process.stdout.write("\n");
  }
  console.log(`  ✓ ${tab}: ${added} added, ${updated} updated`);
}
