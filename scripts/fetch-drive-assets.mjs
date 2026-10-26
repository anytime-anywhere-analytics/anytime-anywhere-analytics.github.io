/**
 * Mirror the "assets" Google Drive folder (next to the CMS sheet) into public/assets/.
 *
 *   node scripts/fetch-drive-assets.mjs                  # fail if not configured
 *   node scripts/fetch-drive-assets.mjs --if-configured  # skip quietly (used by `prebuild`)
 *
 * assets/people/niklas.jpg in Drive → public/assets/people/niklas.jpg → /assets/people/niklas.jpg
 * on the site. Drive wins over a checked-in file with the same path; files that exist only
 * in the repo are left alone. Unchanged files (same size + modified time as the last run,
 * recorded in .cache/drive-assets.json) are not downloaded again.
 * Afterwards every "/assets/…" reference in src/data/*.json is checked against public/.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, dirname, normalize, sep } from "node:path";
import { ROOT, configured, explainUnconfigured, callCms, FILES } from "./cms-env.mjs";

const ifConfigured = process.argv.includes("--if-configured");
if (!configured) { explainUnconfigured(); process.exit(ifConfigured ? 0 : 1); }

const PUBLIC = join(ROOT, "public/assets");
const CACHE = join(ROOT, ".cache/drive-assets.json");

let manifest;
try { manifest = await callCms({}, { assets: "1" }); }
catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
if (!Array.isArray(manifest.assets)) { console.error(`✗ the deployed script is too old for assets (v${manifest.version || 1}) — redeploy cms/Code.gs`); process.exit(1); }
console.log(`Drive assets: ${manifest.assets.length} file(s) in ${manifest.folder}`);

let cache = {};
try { cache = JSON.parse(await readFile(CACHE, "utf8")); } catch { /* first run */ }

const exists = (p) => stat(p).then(() => true, () => false);
let downloaded = 0, skipped = 0, failed = 0;
for (const a of manifest.assets) {
  const rel = normalize(a.path).split(sep).join("/");
  if (rel.startsWith("../") || rel.includes("/../") || rel.startsWith("/")) { console.warn(`  ⚠ skipped odd path ${a.path}`); continue; }
  const dest = join(PUBLIC, rel);
  const stamp = `${a.size}:${a.modified}`;
  if (cache[rel] === stamp && await exists(dest)) { skipped++; continue; }
  if (!a.shared) { console.warn(`  ⚠ ${rel}: could not be made link-viewable in Drive (owned by someone else?) — not downloaded`); failed++; continue; }
  try {
    const res = await fetch(`https://drive.google.com/uc?export=download&id=${a.id}`, { redirect: "follow" });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || type.startsWith("text/html")) throw new Error(`Drive answered ${res.status} ${type.split(";")[0]} — is the file link-viewable?`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (a.size && buf.length !== Number(a.size)) throw new Error(`got ${buf.length} bytes, expected ${a.size}`);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    cache[rel] = stamp; downloaded++;
    console.log(`  ✓ ${rel} (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) { failed++; console.warn(`  ✗ ${rel}: ${e.message}`); }
}
await mkdir(dirname(CACHE), { recursive: true });
await writeFile(CACHE, JSON.stringify(cache, null, 2) + "\n");
console.log(`${downloaded} downloaded, ${skipped} unchanged, ${failed} failed`);

/* every /assets/… mentioned in the content must now exist somewhere under public/assets */
const refs = new Map();
const walk = (v, where) => {
  if (typeof v === "string") { if (v.startsWith("/assets/")) refs.set(v, where); }
  else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], where);
};
for (const name of FILES) {
  try { walk(JSON.parse(await readFile(join(ROOT, "src/data", `${name}.json`), "utf8")), `${name}.json`); } catch { /* not pulled yet */ }
}
let missing = 0;
for (const [ref, where] of refs) if (!(await exists(join(ROOT, "public", ref)))) { missing++; console.warn(`  ⚠ ${where} refers to ${ref}, which is neither in the repo nor in the Drive assets folder`); }
console.log(missing ? `${missing} broken image reference(s) — those pages will show an empty placeholder` : `all ${refs.size} image references resolve`);
if (failed) process.exit(1);
