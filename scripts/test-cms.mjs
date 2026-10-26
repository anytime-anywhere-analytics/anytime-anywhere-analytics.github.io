/**
 * Round-trip src/data/*.json through the Apps Script encoding (cms/Code.gs)
 * without Google: objects → sheet rows → objects must equal the original.
 *
 *   node scripts/test-cms.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = await readFile(join(ROOT, "cms/Code.gs"), "utf8");
const pure = src.split("/* ============================== PURE ============================== */")[1].split("/* ============================== /PURE")[0];

const ctx = vm.createContext({});
vm.runInContext(pure + "\nthis.api = { CMS_VERSION, TABS, FILE_OF, SCHEMA, rowsToObjects, kvToObject, objectsToRows, objectToKv, objectToForm, formToObject, validateAll, proposeId, toSiteData };", ctx);
const { TABS, FILE_OF, SCHEMA, rowsToObjects, kvToObject, objectsToRows, objectToKv, objectToForm, formToObject, validateAll, proposeId, toSiteData } = ctx.api;

/* the sheet returns "" for empty cells, numbers as numbers, checkboxes as booleans — mimic that */
const asSheet = (rows) => rows.map((r) => r.map((v) => (v === undefined || v === null ? "" : v)));
/* key order is irrelevant to the site, and an empty-string value is the same as a missing key; compare canonically */
const canon = (v) => JSON.parse(JSON.stringify(v, (k, x) => {
  if (x === "") return undefined;
  if (x && typeof x === "object" && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().filter((k) => x[k] !== "").map((k) => [k, x[k]]));
  return x;
}));

let failures = 0;
const byTab = {};
for (const tab of TABS) {
  const data = JSON.parse(await readFile(join(ROOT, `src/data/${FILE_OF[tab]}.json`), "utf8"));
  if (tab === "Stats") data.forEach((s) => { s.n = String(s.n); }); // the sheet keeps stat numbers as text
  let back;
  if (SCHEMA[tab].kind === "object") back = kvToObject(tab, asSheet(objectToKv(tab, data)));
  else {
    back = rowsToObjects(tab, asSheet(objectsToRows(tab, data)));
    // and the form path: object → form strings → object
    data.forEach((o, i) => {
      const viaForm = formToObject(tab, objectToForm(tab, o));
      try { assert.deepEqual(canon(viaForm), canon(o)); } catch (e) { failures++; console.log(`✗ ${tab} form round-trip row ${i + 2} (${o[SCHEMA[tab].key]})\n`, e.message.split("\n").slice(0, 12).join("\n")); }
    });
  }
  byTab[tab] = back;
  try { assert.deepEqual(canon(back), canon(data)); console.log(`✓ ${tab}: ${Array.isArray(data) ? data.length + " rows" : "object"} round-trip`); }
  catch (e) { failures++; console.log(`✗ ${tab}\n`, e.message.split("\n").slice(0, 30).join("\n")); }
}

/* checkbox columns fill every sheet row with `false`; those rows must not become records */
{
  const header = SCHEMA.Posts.fields.map((f) => f.key);
  const blankRow = header.map((k) => (k === "video" ? false : ""));
  const got = rowsToObjects("Posts", [header, blankRow, blankRow, header.map((k) => ({ id: "x", title: "T", date: "2026-01-01", tag: "Team", kind: "short", video: false }[k] ?? ""))]);
  assert.equal(got.length, 1, "unchecked-checkbox rows must be skipped");
  console.log("✓ rows holding only unchecked checkboxes are ignored");
}

const issues = validateAll(byTab);
console.log(`\nvalidateAll on current data: ${issues.length} issue(s)`);
for (const i of issues.slice(0, 15)) console.log(`  ${i.tab}${i.row ? " row " + i.row : ""} · ${i.key}: ${i.msg}`);
if (issues.length > 15) console.log(`  … ${issues.length - 15} more`);

/* proposed ids should match what the site uses today */
for (const tab of ["Pillars", "Testbeds", "Members", "Posts", "Publications"]) {
  const miss = byTab[tab].filter((o) => proposeId(tab, o) !== o.id).length;
  console.log(`proposeId(${tab}) differs from the existing id on ${miss}/${byTab[tab].length} rows`);
}

assert.deepEqual(Object.keys(toSiteData(byTab)), Object.values(FILE_OF));
console.log(failures ? `\n${failures} FAILED` : "\nall round-trips OK");
process.exit(failures ? 1 : 0);
