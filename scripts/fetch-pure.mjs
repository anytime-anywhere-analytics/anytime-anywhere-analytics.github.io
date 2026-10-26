#!/usr/bin/env node
/**
 * Pull Niklas Elmqvist's complete publication list out of the Aarhus University
 * research portal (Pure) — every list page, then every publication's own page —
 * and rewrite src/data/publications.json. Hand-curated fields already in that
 * file (id, pillar, testbed, featured, hook, image, pdf, video) are kept, matched
 * by portal URL; new records come out with pillar/testbed set to null for you
 * to fill in.
 *
 *   node scripts/fetch-pure.mjs              # everything (≈200 records, ~5 min)
 *   node scripts/fetch-pure.mjs --pages 1    # first list page only
 *   node scripts/fetch-pure.mjs --resume     # keep records already in the cache
 *
 * pure.au.dk sits behind a Cloudflare challenge that rejects plain HTTP clients
 * and headless Chrome, so this drives a real (visible) Chrome window over the
 * DevTools protocol. It launches one with its own throwaway profile if nothing
 * is listening on --port (default 9333). Progress is cached per record in
 * .cache/pure/ so an interrupted run can be resumed.
 */
import { writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { merge } from "./pure-to-site.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/data/publications.json");
const CACHE = join(ROOT, ".cache/pure");
const PERSON = "elm%40cs.au.dk";
const BASE = "https://pure.au.dk";
const LIST = (p) => `${BASE}/portal/en/persons/${PERSON}/publications/?page=${p}`;

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt; };
const maxPages = parseInt(arg("--pages", "9999"), 10);
const port = parseInt(arg("--port", "9333"), 10);
const resume = process.argv.includes("--resume");
const CHROME = arg("--chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Chrome over the DevTools protocol ─────────────────────────────────── */
async function ensureChrome() {
  try { await fetch(`http://localhost:${port}/json/version`); return null; } catch {}
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; pass --chrome <path>`);
  const profile = join(ROOT, ".cache/chrome-profile");
  const child = spawn(CHROME, ["--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1100,800", "about:blank"], { stdio: "ignore", detached: true });
  for (let i = 0; i < 40; i++) { await sleep(250); try { await fetch(`http://localhost:${port}/json/version`); return child; } catch {} }
  throw new Error("Chrome did not start");
}

async function connect() {
  const pages = await (await fetch(`http://localhost:${port}/json`)).json();
  const t = pages.find((x) => x.type === "page") || (await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: "PUT" })).json());
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, [res, rej]); ws.send(JSON.stringify({ id, method, params })); });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p[1](new Error(m.error.message)) : p[0](m.result); };
  await new Promise((r) => (ws.onopen = r));
  await send("Page.enable");
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  /** navigate and wait until the Cloudflare interstitial is gone and `ready` holds */
  const goto = async (url, ready = "true", timeout = 90000) => {
    await send("Page.navigate", { url });
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      await sleep(500);
      try { if (await evaluate(`document.readyState === "complete" && !/moment/i.test(document.title) && (${ready})`)) return; } catch {}
    }
    throw new Error(`timeout loading ${url}`);
  };
  return { evaluate, goto, close: () => ws.close() };
}

/* ── in-page extractors (serialised and run inside the tab) ────────────── */
const parseList = String(() => {
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const out = [];
  let group = null; // the year heading only precedes the first item of each year
  for (const li of document.querySelectorAll("li.list-result-item")) {
    const a = li.querySelector("h3.title a");
    if (!a) continue;
    group = txt(li.querySelector("h3.search-result-group")) || group;
    const short = li.querySelector(".rendering_researchoutput_portal-short");
    out.push({
      url: a.href,
      title: txt(a),
      citation: txt(short),
      yearGroup: group,
      date: txt(short && short.querySelector(".date")) || null,
      openAccess: !!li.querySelector(".open-access"),
      hasFile: !!li.querySelector(".files"),
      fingerprints: [...li.querySelectorAll(".concept-badge-small, .concept-badge-small-container button")].map((b) => txt(b)).filter(Boolean),
    });
  }
  const total = (document.body.textContent.match(/([\d,.]+)\s+results/) || [])[1] || null;
  const next = document.querySelector("nav.pages li.next a");
  return { items: out, total: total ? parseInt(total.replace(/[,.]/g, ""), 10) : null, hasNext: !!next };
});

const parseDetail = String(() => {
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const all = (sel, root = document) => [...root.querySelectorAll(sel)];
  const abs = (href) => { try { return new URL(href, location.href).href; } catch { return href; } };
  const main = document.querySelector("main") || document.body;

  const title = txt(main.querySelector("h1"));
  const subtitle = txt(main.querySelector(".rendering h1 + .subtitle, .subtitle")) || null;

  /* authors: linked ones are portal persons; plain text ones are external */
  const authors = [];
  const personList = main.querySelector("ul.relations.persons");
  if (personList) {
    for (const li of all(":scope > li", personList)) {
      const a = li.querySelector("a[rel='Person']");
      const name = txt(a ? a.querySelector("span") || a : li).replace(/^,\s*/, "").replace(/\*+$/, "").trim();
      if (!name) continue;
      authors.push({ name, url: a ? a.href : null, corresponding: !!li.querySelector("sup") });
    }
  }

  const organisations = all("ul.relations.organisations li", main).map((li) => {
    const a = li.querySelector("a");
    return { name: txt(a || li), url: a ? a.href : null, kind: li.className || null };
  });

  const typeEl = main.querySelector("p.type"); // rendered twice on the page; read the first
  const type = {
    family: txt(typeEl?.querySelector(".type_family")).replace(/:\s*$/, "") || null,
    parent: txt(typeEl?.querySelector(".type_classification_parent")).replace(/›\s*$/, "").trim() || null,
    classification: typeEl ? all(".type_classification", typeEl).map((s) => txt(s).replace(/^›\s*/, "").trim()).filter(Boolean) : [],
    text: txt(typeEl),
  };

  /* every "Abstract"-style textblock; sections are titled by h2.subheader */
  const sections = {};
  for (const h of all("h2.subheader, h3.subheader", main)) {
    const name = txt(h);
    let el = h.nextElementSibling, chunks = [];
    while (el && !/^H[23]$/.test(el.tagName)) { chunks.push(el); el = el.nextElementSibling; }
    sections[name] = chunks.map(txt).filter(Boolean).join("\n");
  }
  const abstract = all(".rendering_abstractportal .textblock p, .rendering_abstractportal .textblock", main).map(txt).filter(Boolean);
  const abstractText = abstract.length ? [...new Set(abstract)] : (sections["Abstract"] ? [sections["Abstract"]] : []);

  /* the properties table, kept verbatim as key → value plus any links */
  const properties = {};
  for (const tr of all("table.properties tr", main)) {
    const k = txt(tr.querySelector("th")), td = tr.querySelector("td");
    if (!k || !td) continue;
    const links = all("a[href]", td).map((a) => ({ text: txt(a), href: abs(a.getAttribute("href")) })).filter((l) => l.href && !l.href.endsWith("#"));
    properties[k] = links.length ? { text: txt(td), links } : txt(td);
  }

  const dois = [...new Set(all("a[href*='doi.org/']", main).map((a) => abs(a.getAttribute("href"))))];
  const documents = all("ul.documents li", main).map((li) => {
    const a = li.querySelector("a");
    return { label: txt(a), href: a ? abs(a.getAttribute("href")) : null, meta: txt(li.querySelector(".meta")) || null, openAccess: li.classList.contains("open-access") };
  });
  const links = all("ul.links li a[href], .rendering_publicationotherfilesandlinksrenderer a[href]", main).map((a) => ({ label: txt(a), href: abs(a.getAttribute("href")) }));
  const keywords = all(".keywords li, .rendering_keywordsportal li, ul.relations.keywords li", main).map(txt).filter(Boolean);
  const fingerprints = all(".concept-badge-small, .concept-badge-small-container button", main).map(txt).filter(Boolean);
  const relations = {};
  for (const ul of all("ul.relations", main)) {
    const cls = [...ul.classList].filter((c) => c !== "relations").join(" ");
    if (!cls || /persons|organisations|digital_object_identifiers/.test(cls)) continue;
    relations[cls] = all("li", ul).map((li) => { const a = li.querySelector("a"); return { text: txt(li), href: a ? a.href : null }; });
  }
  const metrics = {};
  for (const m of all(".publication-metrics .metric", main)) {
    const label = txt(m.querySelector(".label")), count = txt(m.querySelector(".count"));
    if (label) metrics[label] = /^\d+$/.test(count) ? parseInt(count, 10) : count;
  }
  const altmetricId = (main.querySelector(".altmetric-embed a[href*='citation_id=']")?.href.match(/citation_id=(\d+)/) || [])[1] || null;
  const openAccess = !!main.querySelector(".open-access") || /open access/i.test(txt(main.querySelector(".publication-sidebar")));
  const status = txt(main.querySelector("tr.status td")) || null;
  const dateText = txt(main.querySelector("tr.status .date")) || null;
  const year = parseInt((dateText || "").match(/\b(19|20)\d{2}\b/)?.[0] || "", 10) || null;
  const language = txt(main.querySelector("tr.language td")) || null;

  /* Google Scholar style meta tags, when present */
  const meta = {};
  for (const m of all("meta[name^='citation_'], meta[name^='DC.'], meta[name^='dc.']")) {
    const k = m.getAttribute("name"), v = m.getAttribute("content");
    if (!k || !v) continue;
    if (meta[k] === undefined) meta[k] = v; else meta[k] = [].concat(meta[k], v);
  }

  return {
    title, subtitle, authors, organisations, type, year, dateText, status, language,
    abstract: abstractText, properties, dois, documents, links, keywords, fingerprints, relations,
    metrics, altmetricId, openAccess, sections, meta,
  };
});

/* ── crawl ─────────────────────────────────────────────────────────────── */
await mkdir(CACHE, { recursive: true });
const chrome = await ensureChrome();
const tab = await connect();
const cacheKey = (url) => url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_") + ".json";

let listed = [];
let total = null;
for (let p = 0; p < maxPages; p++) {
  await tab.goto(LIST(p), `document.querySelector("li.list-result-item, .search-results, main") !== null`);
  await sleep(400);
  const { items, total: t, hasNext } = await tab.evaluate(`(${parseList})()`);
  if (t) total = t;
  console.log(`list page ${p + 1}: ${items.length} publications${total ? ` (of ${total})` : ""}`);
  if (!items.length) break;
  listed.push(...items);
  if (!hasNext) break;
  await sleep(600);
}
/* de-duplicate by URL, keep the first sighting (list is newest first) */
const byUrl = new Map();
for (const it of listed) if (!byUrl.has(it.url)) byUrl.set(it.url, it);
listed = [...byUrl.values()];
console.log(`${listed.length} unique publications listed`);

const records = [];
let n = 0;
for (const it of listed) {
  n++;
  const cf = join(CACHE, cacheKey(it.url));
  let detail = null;
  if (resume && existsSync(cf)) {
    try { detail = JSON.parse(await readFile(cf, "utf8")); } catch {}
  }
  if (!detail) {
    for (let attempt = 1; attempt <= 3 && !detail; attempt++) {
      try {
        await tab.goto(it.url, `document.querySelector("main h1") !== null`);
        await sleep(300);
        detail = await tab.evaluate(`(${parseDetail})()`);
        await writeFile(cf, JSON.stringify(detail, null, 2));
      } catch (e) {
        console.warn(`  [${n}/${listed.length}] attempt ${attempt} failed for ${it.url}: ${e.message}`);
        await sleep(1500 * attempt);
      }
    }
    await sleep(500); // be a polite guest on the portal
  }
  if (!detail) { console.warn(`  skipped ${it.url}`); continue; }
  console.log(`  [${n}/${listed.length}] ${detail.title.slice(0, 80)}`);
  records.push({
    id: it.url.replace(/\/$/, "").split("/").pop(),
    portal: it.url,
    list: { citation: it.citation, date: it.date, yearGroup: it.yearGroup, openAccess: it.openAccess, hasFile: it.hasFile, fingerprints: it.fingerprints },
    ...detail,
    fetchedAt: new Date().toISOString(),
  });
}

let existing = [];
try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch {}
const pubs = merge(records, existing);
await writeFile(OUT, JSON.stringify(pubs, null, 2) + "\n");
const untagged = pubs.filter((p) => !p.pillar || !p.testbed);
console.log(`wrote ${pubs.length} publications → ${OUT}`);
if (untagged.length) console.log(`${untagged.length} need a pillar/testbed: ${untagged.map((p) => p.id).join(", ")}`);
tab.close();
if (chrome) chrome.kill();
process.exit(0);
