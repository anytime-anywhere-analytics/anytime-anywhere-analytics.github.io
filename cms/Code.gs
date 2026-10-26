/**
 * CA³ site CMS — Google Apps Script bound to the "CA³ Site Content" spreadsheet.
 *
 * One tab per file in src/data/. Column headers are the JSON keys; the SCHEMA
 * below says how each cell is turned into JSON:
 *
 *   text    plain string
 *   long    plain string, multi-line editor in the form
 *   list    string[]           — one item per line
 *   paras   string[]           — paragraphs separated by a blank line
 *   pairs   [a, b][]           — one per line, "a | b"   (keys: [...] makes objects instead)
 *   number  number
 *   bool    checkbox
 *   date    "YYYY-MM-DD"
 *   select  string from `options`, or from another tab's column (`from`)
 *
 * Empty cells are left out of the JSON, unless the field is `nullable` (then it
 * becomes null) or `always` (an empty list). Header names may use dots for
 * nested keys ("film.still").
 * Columns whose header starts with "_" are ignored, so notes can live there.
 *
 * Menu:  CA³ CMS → Add row… / Edit selected row… / Validate / Preview JSON /
 *        Import JSON files… / Set up tabs / Set API token…
 *
 * The site pulls everything through doGet (deploy as web app, "Anyone"):
 *   GET  <exec-url>?token=…            → { ok, generatedAt, data:{site,pillars,…}, issues }
 *   GET  <exec-url>?token=…&assets=1   → { ok, folder, assets:[{path,id,size,modified}] }
 *                                        (the "assets" Drive folder next to the sheet, mirrored
 *                                         into public/assets/ by scripts/fetch-drive-assets.mjs)
 *   POST <exec-url>  {token, tab, rows} → upsert rows by id (used after a Pure sync)
 *
 * Everything between the ==== PURE ==== markers uses no Google services, so
 * it can be unit-tested in Node (see scripts/test-cms.mjs).
 */

/* ============================== PURE ============================== */

/** bumped whenever Code.gs changes; fetch-sheets.mjs prints it so a stale deployment is obvious */
const CMS_VERSION = 4;

const TABS = ["Site", "Pillars", "Testbeds", "Members", "Posts", "Publications", "Stats"];

const FILE_OF = { Site: "site", Pillars: "pillars", Testbeds: "testbeds", Members: "members", Posts: "posts", Publications: "publications", Stats: "stats" };

const AREA_FIELDS = [
  { key: "id", type: "text", required: true, help: "URL slug, e.g. ubiquitous. Auto-filled from the title." },
  { key: "num", type: "text", required: true, help: "Label shown on the card, e.g. 01 or T1" },
  { key: "title", type: "text", required: true },
  { key: "body", type: "long", required: true, help: "One-sentence card copy" },
  { key: "long", type: "long", required: true, help: "Modal copy" },
  { key: "image", type: "text", help: "/assets/img/…" },
];

const SCHEMA = {
  Site: {
    kind: "object",
    fields: [
      { key: "name", type: "text", required: true },
      { key: "short", type: "text", required: true },
      { key: "domain", type: "text", required: true },
      { key: "host", type: "text", required: true },
      { key: "grant", type: "text" },
      { key: "tagline", type: "text", required: true },
      { key: "contact", type: "list", always: true, help: "Address lines, one per line" },
      { key: "funders", type: "pairs", always: true, keys: ["alt", "src"], help: "Name | /assets/logo.webp — one per line" },
      { key: "social", type: "pairs", always: true, help: "Label | URL — one per line" },
      { key: "film.still", type: "text", help: "Poster image for the hero film" },
      { key: "film.url", type: "text" },
      { key: "film.vimeoId", type: "text" },
    ],
  },
  Pillars: { kind: "list", key: "id", idFrom: "title", fields: AREA_FIELDS },
  Testbeds: { kind: "list", key: "id", idFrom: "title", fields: AREA_FIELDS },
  Members: {
    kind: "list", key: "id", idFrom: "name",
    fields: [
      { key: "id", type: "text", required: true, help: "URL slug. Auto-filled from the name." },
      { key: "name", type: "text", required: true, help: "Must match the spelling used in publication author lists and post bylines" },
      { key: "role", type: "text", required: true },
      { key: "org", type: "text", required: true },
      { key: "group", type: "select", required: true, options: ["faculty", "current", "alumni", "external"] },
      { key: "since", type: "text", help: "e.g. Jan 2024" },
      { key: "areas", type: "list", help: "Pillar titles, one per line" },
      { key: "bio", type: "long" },
      { key: "links", type: "pairs", help: "Label | URL — one per line" },
      { key: "photo", type: "text", help: "/assets/people/…" },
    ],
  },
  Posts: {
    kind: "list", key: "id", idFrom: "date+title",
    fields: [
      { key: "id", type: "text", required: true, help: "Auto-filled as YYYY-MM-DD-slug-of-title" },
      { key: "date", type: "date", required: true },
      { key: "tag", type: "select", required: true, options: ["Team", "Hiring", "Blog", "Event", "Paper", "Update", "Grant", "Award", "Talk", "Press"], allowOther: true },
      { key: "kind", type: "select", required: true, options: ["short", "long"], help: "short opens in a dialog; long gets its own page" },
      { key: "title", type: "text", required: true },
      { key: "dek", type: "long", help: "Teaser shown in the list" },
      { key: "body", type: "paras", always: true, help: "Paragraphs separated by a blank line. Bare URLs become links." },
      { key: "by", type: "select", from: { tab: "Members", field: "name" }, allowOther: true, help: "Byline — pick a member to link it" },
      { key: "source", type: "text", help: "e.g. linkedin" },
      { key: "link", type: "text", help: "Original post URL" },
      { key: "article.href", type: "text", help: "Linked article URL" },
      { key: "article.title", type: "text", help: "Linked article title" },
      { key: "image", type: "text", help: "Lead image, /assets/img/news/…" },
      { key: "images", type: "list", help: "Extra images, one per line" },
      { key: "video", type: "bool", help: "Post contains a video" },
    ],
  },
  Publications: {
    kind: "list", key: "id", idFrom: "title",
    fields: [
      { key: "id", type: "text", required: true, help: "URL slug; keep stable once published" },
      { key: "type", type: "select", required: true, options: ["jrnl", "conf", "preprint", "chapter"] },
      { key: "title", type: "text", required: true },
      { key: "authors", type: "list", required: true, always: true, help: "One per line, spelled as in Members" },
      { key: "venue", type: "text", required: true },
      { key: "year", type: "number", required: true },
      { key: "pillar", type: "select", nullable: true, from: { tab: "Pillars", field: "title" } },
      { key: "testbed", type: "select", nullable: true, from: { tab: "Testbeds", field: "title" } },
      { key: "featured", type: "number", help: "Rank on the home page (1 = first). Blank = not featured." },
      { key: "hook", type: "long", help: "One-line pitch for featured papers" },
      { key: "image", type: "text", help: "Figure, /assets/img/…" },
      { key: "video", type: "text", help: "YouTube / Vimeo URL" },
      { key: "pdf", type: "text" },
      { key: "doi", type: "text", help: "https://doi.org/…" },
      { key: "portal", type: "text", help: "pure.au.dk URL — how a Pure sync matches this row" },
      { key: "abstract", type: "paras", always: true },
      { key: "keywords", type: "list", always: true },
    ],
  },
  Stats: {
    kind: "list", key: "l",
    fields: [
      { key: "n", type: "text", required: true, help: "The number (kept as text so 100+ works)" },
      { key: "l", type: "text", required: true, help: "Label" },
    ],
  },
};

const PAIR_SEP = " | ";

function slugify(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** the id publications get from a title: the system name before a colon or dash, else six words */
function slugOfTitle(title) {
  const t = String(title || "").replace(/['’]/g, "");
  const m = t.match(/^(.{2,60}?)(?::\s|\s[–—-]\s)/);
  const base = m ? m[1] : t.split(/\s+/).slice(0, 6).join(" ");
  return slugify(base.replace(/^[“"‘]+|[”"’]+$/g, ""));
}

function proposeId(tab, obj) {
  const s = SCHEMA[tab];
  if (s.idFrom === "date+title") return `${obj.date || ""}-${slugify(obj.title).split("-").slice(0, 6).join("-")}`.replace(/^-|-$/g, "");
  if (tab === "Publications") return slugOfTitle(obj.title);
  return slugify(obj[s.idFrom]);
}

function isBlank(v) { return v === undefined || v === null || (typeof v === "string" && v.trim() === ""); }

/** checkbox columns fill every row with `false`, so a row of blanks and unchecked boxes is still empty */
function isEmptyRow(row) { return row.every((v) => isBlank(v) || v === false); }

function splitLines(cell) {
  return String(cell).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** cell → JSON value; undefined means "leave the key out" (`always` lists become [] instead) */
function decodeValue(f, cell) {
  if (isBlank(cell)) return f.always ? [] : f.nullable ? null : undefined;
  switch (f.type) {
    case "list": return splitLines(cell);
    case "paras": {
      const ps = String(cell).replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      return ps.length ? ps : undefined;
    }
    case "pairs": {
      const rows = splitLines(cell).map((l) => l.split("|").map((x) => x.trim()));
      if (f.keys) return rows.map((r) => Object.fromEntries(f.keys.map((k, i) => [k, r[i] || ""])));
      return rows.map((r) => [r[0] || "", r[1] || ""]);
    }
    case "number": {
      const n = typeof cell === "number" ? cell : Number(String(cell).trim());
      return Number.isFinite(n) ? n : undefined;
    }
    case "bool": {
      if (typeof cell === "boolean") return cell || undefined;
      return /^(true|yes|1|x)$/i.test(String(cell).trim()) || undefined;
    }
    case "date": {
      if (cell instanceof Date) return dateToIso(cell);
      const m = String(cell).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : String(cell).trim();
    }
    default: return String(cell).trim();
  }
}

function dateToIso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** JSON value → cell string */
function encodeValue(f, v) {
  if (v === undefined || v === null) return "";
  switch (f.type) {
    case "list": return (v || []).join("\n");
    case "paras": return (v || []).join("\n\n");
    case "pairs": return (v || []).map((p) => (f.keys ? f.keys.map((k) => p[k] ?? "") : p).join(PAIR_SEP)).join("\n");
    case "bool": return !!v;
    case "number": return v;
    default: return String(v);
  }
}

function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function setPath(obj, path, v) {
  const ks = path.split("."); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {};
  o[ks[ks.length - 1]] = v;
}

function fieldByKey(tab, key) { return SCHEMA[tab].fields.find((f) => f.key === key); }

/** header row + value rows (as read from the sheet) → array of objects (list tabs) */
function rowsToObjects(tab, values) {
  const s = SCHEMA[tab];
  const header = values[0].map((h) => String(h).trim());
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (isEmptyRow(row)) continue;
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key || key.startsWith("_")) continue;
      const f = fieldByKey(tab, key) || { key, type: "text" };
      const v = decodeValue(f, row[c]);
      if (v !== undefined) setPath(obj, key, v);
    }
    // put keys in schema order so the JSON diff stays quiet
    const ordered = {};
    for (const f of s.fields) { const v = getPath(obj, f.key); if (v !== undefined) setPath(ordered, f.key, v); }
    for (const k of Object.keys(obj)) if (!(k in ordered)) ordered[k] = obj[k];
    out.push(ordered);
  }
  return out;
}

/** Site tab: Key | Value rows → object */
function kvToObject(tab, values) {
  const obj = {};
  for (let r = 1; r < values.length; r++) {
    const key = String(values[r][0] || "").trim();
    if (!key || key.startsWith("_")) continue;
    const f = fieldByKey(tab, key) || { key, type: "text" };
    const v = decodeValue(f, values[r][1]);
    if (v !== undefined) setPath(obj, key, v);
  }
  const ordered = {};
  for (const f of SCHEMA[tab].fields) { const v = getPath(obj, f.key); if (v !== undefined) setPath(ordered, f.key, v); }
  for (const k of Object.keys(obj)) if (!(k in ordered)) ordered[k] = obj[k];
  return ordered;
}

function objectsToRows(tab, objects) {
  const fields = SCHEMA[tab].fields;
  return [fields.map((f) => f.key)].concat(objects.map((o) => fields.map((f) => encodeValue(f, getPath(o, f.key)))));
}

function objectToKv(tab, obj) {
  return [["key", "value", "_hint"]].concat(SCHEMA[tab].fields.map((f) => [f.key, encodeValue(f, getPath(obj, f.key)), hintFor(f)]));
}

function hintFor(f) {
  const t = { list: "one per line", paras: "paragraphs, blank line between", pairs: "a | b, one per line", bool: "checkbox", number: "number", date: "YYYY-MM-DD" }[f.type] || "";
  return [f.help, t].filter(Boolean).join(" — ");
}

/** the form edits cell strings, not JSON: object → {key: cellString} */
function objectToForm(tab, obj) {
  const out = {};
  for (const f of SCHEMA[tab].fields) out[f.key] = encodeValue(f, getPath(obj, f.key));
  return out;
}

/** {key: cellString} → JSON object (what the form submits) */
function formToObject(tab, form) {
  const obj = {};
  for (const f of SCHEMA[tab].fields) {
    const v = decodeValue(f, form[f.key]);
    if (v !== undefined) setPath(obj, f.key, v);
  }
  return obj;
}

/** cross-tab checks; returns [{tab, row, key, msg}] (row is 1-based sheet row, or null) */
function validateAll(data) {
  const issues = [];
  const push = (tab, row, key, msg) => issues.push({ tab, row, key, msg });
  for (const f of SCHEMA.Site.fields) if (f.required && isBlank(getPath(data.Site || {}, f.key))) push("Site", null, f.key, "required");
  const listTabs = TABS.filter((t) => SCHEMA[t].kind === "list");
  for (const tab of listTabs) {
    const s = SCHEMA[tab]; const rows = data[tab] || []; const seen = new Map();
    rows.forEach((o, i) => {
      const row = i + 2;
      for (const f of s.fields) {
        const v = getPath(o, f.key);
        if (f.required && (v === undefined || v === null || (Array.isArray(v) && !v.length))) push(tab, row, f.key, "required");
        if (f.type === "select" && v && !f.allowOther) {
          const opts = f.options || (data[f.from.tab] || []).map((x) => x[f.from.field]);
          if (!opts.includes(v)) push(tab, row, f.key, `"${v}" is not one of: ${opts.join(", ")}`);
        }
      }
      const id = o[s.key];
      if (id !== undefined) {
        if (seen.has(id)) push(tab, row, s.key, `duplicate of row ${seen.get(id)}`);
        seen.set(id, row);
        if (s.key === "id" && id !== slugify(id)) push(tab, row, "id", "should be a lowercase slug (a-z, 0-9, dashes)");
      }
    });
  }
  const members = new Set((data.Members || []).map((m) => m.name));
  (data.Posts || []).forEach((p, i) => {
    if (p.by && !members.has(p.by)) push("Posts", i + 2, "by", `"${p.by}" is not a member name — byline will not link`);
    if (p.kind === "long" && !(p.body || []).length) push("Posts", i + 2, "body", "long posts need a body");
  });
  const pillars = new Set((data.Pillars || []).map((p) => p.title));
  (data.Members || []).forEach((m, i) => (m.areas || []).forEach((a) => { if (!pillars.has(a)) push("Members", i + 2, "areas", `"${a}" is not a pillar title`); }));
  const ranks = (data.Publications || []).filter((p) => p.featured).map((p) => p.featured).sort((a, b) => a - b);
  ranks.forEach((r, i) => { if (ranks.indexOf(r) !== i) push("Publications", null, "featured", `rank ${r} used more than once`); });
  return issues;
}

/** {Tab: rows|object} → {site, pillars, …} keyed like the files */
function toSiteData(byTab) {
  const out = {};
  for (const tab of TABS) out[FILE_OF[tab]] = byTab[tab];
  return out;
}

/* ============================== /PURE ============================== */

/* ---------- reading & writing the sheet ---------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/** number format per schema column: everything but numbers and checkboxes is plain text ("@") */
function isTextField_(f) { return f.type !== "number" && f.type !== "bool"; }

/** apply plain-text format to a tab's text columns (whole columns, so new rows inherit it) */
function ensureTextFormats_(sh, tab) {
  const s = SCHEMA[tab]; const rows = Math.max(sh.getMaxRows() - 1, 1);
  if (s.kind === "object") { sh.getRange(2, 2, rows, 1).setNumberFormat("@"); return; }
  const idx = headerIndex_(sh);
  for (const f of s.fields) if (isTextField_(f) && idx[f.key]) sh.getRange(2, idx[f.key], rows, 1).setNumberFormat("@");
}

function sheetOf_(tab) {
  const sh = ss_().getSheetByName(tab);
  if (!sh) throw new Error(`Missing tab "${tab}" — run CA³ CMS → Set up tabs`);
  return sh;
}

function readTab_(tab) {
  const values = sheetOf_(tab).getDataRange().getValues();
  if (!values.length) return SCHEMA[tab].kind === "object" ? {} : [];
  return SCHEMA[tab].kind === "object" ? kvToObject(tab, values) : rowsToObjects(tab, values);
}

function readAll_() {
  const byTab = {};
  for (const tab of TABS) byTab[tab] = readTab_(tab);
  return byTab;
}

function headerIndex_(sh) {
  const header = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map((h) => String(h).trim());
  const idx = {}; header.forEach((h, i) => { if (h) idx[h] = i + 1; });
  return idx;
}

/** write one object into a row (1-based) in a single call; missing columns are appended to the header */
function writeObject_(sh, tab, rowNum, obj) {
  let idx = headerIndex_(sh);
  const missing = SCHEMA[tab].fields.filter((f) => !idx[f.key]);
  if (missing.length) {
    sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing.map((f) => f.key)]);
    idx = headerIndex_(sh);
  }
  const width = sh.getLastColumn();
  const range = sh.getRange(rowNum, 1, 1, width);
  const row = rowNum <= sh.getLastRow() ? range.getValues()[0] : new Array(width).fill("");
  const formats = range.getNumberFormats()[0];
  for (const f of SCHEMA[tab].fields) {
    row[idx[f.key] - 1] = encodeValue(f, getPath(obj, f.key));
    if (isTextField_(f)) formats[idx[f.key] - 1] = "@";
  }
  range.setNumberFormats([formats]).setValues([row]);
}

function findRowById_(sh, tab, id) {
  const key = SCHEMA[tab].key; const idx = headerIndex_(sh);
  if (!idx[key]) return -1;
  const col = sh.getRange(2, idx[key], Math.max(1, sh.getLastRow() - 1), 1).getValues();
  for (let i = 0; i < col.length; i++) if (String(col[i][0]).trim() === String(id)) return i + 2;
  return -1;
}

/* ---------- menu ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("CA³ CMS")
    .addItem("Add row…", "showAddForm")
    .addItem("Edit selected row…", "showEditForm")
    .addSeparator()
    .addItem("Validate", "showValidation")
    .addItem("Preview JSON for this tab", "showPreview")
    .addSeparator()
    .addItem("Import JSON files…", "showImport")
    .addItem("Set up tabs", "setupTabs")
    .addItem("Set API token…", "setToken")
    .addItem("Open the images folder", "showAssetsFolder")
    .addItem("How the site reads this sheet", "showHelp")
    .addToUi();
}

function currentListTab_() {
  const tab = ss_().getActiveSheet().getName();
  if (!SCHEMA[tab]) throw new Error(`"${tab}" is not a content tab. Switch to one of: ${TABS.join(", ")}`);
  if (SCHEMA[tab].kind !== "list") throw new Error(`The ${tab} tab is edited in place (key / value) — no form needed.`);
  return tab;
}

function formOptions_(tab) {
  const all = readAll_();
  const opts = {};
  for (const f of SCHEMA[tab].fields) if (f.type === "select") opts[f.key] = f.options || all[f.from.tab].map((x) => x[f.from.field]).filter(Boolean);
  return opts;
}

function openForm_(tab, rowNum, obj) {
  const t = HtmlService.createTemplateFromFile("Form");
  t.payload = JSON.stringify({ tab, rowNum, fields: SCHEMA[tab].fields, values: objectToForm(tab, obj), options: formOptions_(tab) }).replace(/</g, "\\u003c");
  const html = t.evaluate().setWidth(640).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, rowNum ? `Edit ${tab} row ${rowNum}` : `Add to ${tab}`);
}

function showAddForm() {
  try { const tab = currentListTab_(); openForm_(tab, 0, {}); }
  catch (e) { SpreadsheetApp.getUi().alert(e.message); }
}

function showEditForm() {
  try {
    const tab = currentListTab_();
    const sh = sheetOf_(tab); const rowNum = sh.getActiveRange().getRow();
    if (rowNum < 2) throw new Error("Select a cell in the row you want to edit.");
    const values = [sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0]];
    const obj = rowsToObjects(tab, values)[0];
    if (!obj) throw new Error(`Row ${rowNum} is empty — use Add row… instead.`);
    openForm_(tab, rowNum, obj);
  } catch (e) { SpreadsheetApp.getUi().alert(e.message); }
}

/** called from Form.html; returns {rowNum, id} */
function saveRow(tab, rowNum, form) {
  const s = SCHEMA[tab]; const sh = sheetOf_(tab);
  const obj = formToObject(tab, form);
  if (s.key === "id" && isBlank(obj.id)) obj.id = proposeId(tab, obj);
  const errors = [];
  for (const f of s.fields) {
    const v = getPath(obj, f.key);
    if (f.required && (v === undefined || v === null || (Array.isArray(v) && !v.length))) errors.push(`${f.key} is required`);
  }
  if (s.key === "id" && obj.id !== slugify(obj.id)) errors.push("id must be a lowercase slug");
  const existing = findRowById_(sh, tab, obj[s.key]);
  if (existing > 0 && existing !== rowNum) errors.push(`${s.key} "${obj[s.key]}" already exists in row ${existing}`);
  if (errors.length) throw new Error(errors.join("\n"));
  const lock = LockService.getDocumentLock(); lock.waitLock(10000);
  try {
    if (!rowNum) rowNum = sh.getLastRow() + 1;
    writeObject_(sh, tab, rowNum, obj);
  } finally { lock.releaseLock(); }
  sh.setActiveRange(sh.getRange(rowNum, 1));
  return { rowNum, id: obj[s.key] };
}

function showValidation() {
  const issues = validateAll(readAll_());
  const ui = SpreadsheetApp.getUi();
  if (!issues.length) return ui.alert("Validation", "No problems found.", ui.ButtonSet.OK);
  const lines = issues.slice(0, 60).map((i) => `${i.tab}${i.row ? " row " + i.row : ""} · ${i.key}: ${i.msg}`);
  if (issues.length > 60) lines.push(`… and ${issues.length - 60} more`);
  const html = HtmlService.createHtmlOutput(`<pre style="font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap">${lines.map(esc_).join("\n")}</pre>`).setWidth(720).setHeight(560);
  ui.showModalDialog(html, `${issues.length} issue${issues.length === 1 ? "" : "s"}`);
}

function showPreview() {
  const tab = ss_().getActiveSheet().getName();
  if (!SCHEMA[tab]) return SpreadsheetApp.getUi().alert(`"${tab}" is not a content tab.`);
  const json = JSON.stringify(readTab_(tab), null, 2);
  const html = HtmlService.createHtmlOutput(`<pre style="font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap">${esc_(json)}</pre>`).setWidth(760).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, `src/data/${FILE_OF[tab]}.json`);
}

function esc_(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

/* ---------- tab setup ---------- */

/** create missing tabs, write headers, hints, dropdowns, formatting. Never deletes data. */
function setupTabs() {
  const ss = ss_();
  for (const tab of TABS) {
    let sh = ss.getSheetByName(tab);
    if (!sh) sh = ss.insertSheet(tab);
    const s = SCHEMA[tab];
    if (s.kind === "object") {
      if (sh.getLastRow() < 2) sh.getRange(1, 1, s.fields.length + 1, 3).setValues(objectToKv(tab, {}));
      sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 520); sh.setColumnWidth(3, 320);
      sh.getRange(1, 1, 1, 3).setFontWeight("bold");
      sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setNumberFormat("@").setWrap(true);
      sh.getRange(2, 3, sh.getMaxRows() - 1, 1).setFontColor("#888888");
    } else {
      const idx = headerIndex_(sh);
      const missing = s.fields.filter((f) => !idx[f.key]);
      if (missing.length) sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing.map((f) => f.key)]);
      const idx2 = headerIndex_(sh);
      for (const f of s.fields) {
        const c = idx2[f.key];
        sh.getRange(1, c).setNote(hintFor(f) || f.type);
        const body = sh.getRange(2, c, sh.getMaxRows() - 1, 1);
        if (["long", "paras", "list", "pairs"].includes(f.type)) { body.setWrap(true); sh.setColumnWidth(c, f.type === "long" || f.type === "paras" ? 420 : 220); }
        if (isTextField_(f)) body.setNumberFormat("@");
        if (f.type === "bool") body.insertCheckboxes();
        if (f.type === "select") {
          const rule = f.options
            ? SpreadsheetApp.newDataValidation().requireValueInList(f.options, true)
            : SpreadsheetApp.newDataValidation().requireValueInRange(rangeOfColumn_(ss, f.from.tab, f.from.field), true);
          body.setDataValidation(rule.setAllowInvalid(!!f.allowOther).build());
        }
      }
      sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight("bold");
    }
    sh.setFrozenRows(1);
    if (s.kind === "list" && s.key === "id") sh.setFrozenColumns(1);
  }
  // drop the default empty sheet the spreadsheet came with (whatever the locale calls it)
  for (const x of ss.getSheets()) if (!TABS.includes(x.getName()) && x.getLastRow() === 0 && x.getLastColumn() === 0) ss.deleteSheet(x);
  ss.setActiveSheet(ss.getSheetByName(TABS[0]));
}

function rangeOfColumn_(ss, tab, key) {
  const sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
  let col = headerIndex_(sh)[key];
  if (!col) { col = sh.getLastColumn() + 1; sh.getRange(1, col).setValue(key); }
  return sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1);
}

/* ---------- import (seed from src/data/*.json) ---------- */

function showImport() {
  const html = HtmlService.createHtmlOutputFromFile("Import").setWidth(560).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, "Import JSON files");
}

/** called from Import.html with {tab: parsedJson}; replaces the tab's data. */
function importJson(byTab, replace) {
  setupTabs();
  const report = [];
  for (const tab of Object.keys(byTab)) {
    if (!SCHEMA[tab]) { report.push(`${tab}: skipped (unknown tab)`); continue; }
    const sh = sheetOf_(tab); const data = byTab[tab];
    const lock = LockService.getDocumentLock(); lock.waitLock(20000);
    try {
      ensureTextFormats_(sh, tab);
      if (SCHEMA[tab].kind === "object") {
        const rows = objectToKv(tab, data);
        sh.clearContents(); sh.getRange(1, 1, rows.length, 3).setValues(rows);
        report.push(`${tab}: ${SCHEMA[tab].fields.length} fields`);
      } else {
        const rows = objectsToRows(tab, data);
        if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
        if (replace) { sh.clearContents(); sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows); }
        else { for (const o of data) { const r = findRowById_(sh, tab, o[SCHEMA[tab].key]); writeObject_(sh, tab, r > 0 ? r : sh.getLastRow() + 1, o); } }
        report.push(`${tab}: ${data.length} rows`);
      }
    } finally { lock.releaseLock(); }
  }
  setupTabs();
  return report.join("\n");
}

/* ---------- token & help ---------- */

function setToken() {
  const ui = SpreadsheetApp.getUi();
  const current = PropertiesService.getScriptProperties().getProperty("CMS_TOKEN");
  const res = ui.prompt("API token", `The site must send this token to read the sheet.${current ? "\nA token is already set; leave blank to generate a new random one." : "\nLeave blank to generate a random one."}`, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const token = res.getResponseText().trim() || Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("CMS_TOKEN", token);
  ui.alert("Token set", `CMS_TOKEN=${token}\n\nPut this in the site's build environment as CMS_TOKEN.`, ui.ButtonSet.OK);
}

function showHelp() {
  const url = ScriptApp.getService().getUrl() || "(deploy first: Deploy → New deployment → Web app, execute as Me, access Anyone)";
  const html = HtmlService.createHtmlOutput(`<div style="font:14px/1.5 system-ui;padding:4px 8px">
    <p>The site's build runs <code>node scripts/fetch-sheets.mjs</code>, which requests:</p>
    <pre style="white-space:pre-wrap;background:#f3f3f3;padding:8px">${esc_(url)}?token=…</pre>
    <p>and writes the response into <code>src/data/*.json</code>. Set these in the host's build environment:</p>
    <pre style="background:#f3f3f3;padding:8px">CMS_URL=${esc_(url)}\nCMS_TOKEN=(from "Set API token…")</pre>
    <p>After changing this script, re-deploy (Deploy → Manage deployments → ✎ → New version) — the URL stays the same.</p>
  </div>`).setWidth(640).setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, "How the site reads this sheet");
}

/* ---------- images & files in Drive ---------- */

/** the "assets" folder next to the spreadsheet; its tree mirrors public/assets/ on the site */
function assetsFolder_() {
  const parents = DriveApp.getFileById(ss_().getId()).getParents();
  const home = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const it = home.getFoldersByName("assets");
  return it.hasNext() ? it.next() : home.createFolder("assets");
}

/**
 * Every file under assets/, with the path the site will serve it at. Files are
 * made link-viewable so the build can download them straight from Drive; the
 * response says when that could not be done (e.g. a file owned by someone else).
 */
function listAssets_() {
  const out = [];
  const walk = (folder, prefix) => {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      const type = f.getMimeType() || "";
      if (type.startsWith("application/vnd.google-apps")) continue; // Docs/Sheets/Drawings are not site files
      let shared = true;
      try { if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
      catch (err) { shared = false; }
      out.push({ path: prefix + f.getName(), id: f.getId(), size: f.getSize(), modified: f.getLastUpdated().toISOString(), type, shared });
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) { const sub = subs.next(); walk(sub, prefix + sub.getName() + "/"); }
  };
  walk(assetsFolder_(), "");
  return out;
}

function showAssetsFolder() {
  const url = assetsFolder_().getUrl();
  const html = HtmlService.createHtmlOutput(`<div style="font:14px/1.5 system-ui;padding:4px 8px">
    <p>Images live in the <a href="${esc_(url)}" target="_blank">assets</a> folder next to this sheet. Its sub-folders mirror the
    site: <code>people/niklas.jpg</code> becomes <code>/assets/people/niklas.jpg</code>, which is what you type in an
    <code>image</code> / <code>photo</code> cell.</p>
    <p>The site downloads the folder at every build, so a new or replaced file shows up on the next rebuild.
    Use lowercase file names without spaces.</p>
  </div>`).setWidth(560).setHeight(240);
  SpreadsheetApp.getUi().showModalDialog(html, "Images folder");
}

/* ---------- web API ---------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(given) {
  const want = PropertiesService.getScriptProperties().getProperty("CMS_TOKEN");
  if (!want) throw new Error("No CMS_TOKEN set — run CA³ CMS → Set API token… in the sheet");
  if (String(given || "") !== want) throw new Error("bad token");
}

function doGet(e) {
  try {
    checkToken_(e && e.parameter && e.parameter.token);
    if (e.parameter.assets) return json_({ ok: true, version: CMS_VERSION, folder: assetsFolder_().getUrl(), assets: listAssets_() });
    const tab = e.parameter.tab;
    const byTab = tab ? { [tab]: readTab_(tab) } : readAll_();
    const issues = tab ? [] : validateAll(byTab);
    const data = tab ? { [FILE_OF[tab]]: byTab[tab] } : toSiteData(byTab);
    return json_({ ok: true, version: CMS_VERSION, generatedAt: new Date().toISOString(), data, issues });
  } catch (err) { return json_({ ok: false, error: err.message }); }
}

/**
 * Upsert rows. Body: {token, tab, rows:[obj], preserve:[key…], replace}.
 * Rows are matched by the tab's key; for matched rows, non-empty cells in
 * `preserve` columns win over the incoming value (so a Pure sync never wipes curation).
 * `replace: true` clears the tab's rows first (a full import). For the Site tab,
 * `rows` is the one object and the key/value cells are rewritten.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    checkToken_(body.token);
    const tab = body.tab;
    if (!SCHEMA[tab]) throw new Error(`unknown tab "${tab}"`);
    if (!ss_().getSheetByName(tab)) setupTabs();
    const sh = sheetOf_(tab);
    const lock = LockService.getDocumentLock(); lock.waitLock(30000);
    let added = 0, updated = 0;
    try {
      ensureTextFormats_(sh, tab);
      if (SCHEMA[tab].kind === "object") {
        const rows = objectToKv(tab, Array.isArray(body.rows) ? body.rows[0] || {} : body.rows || {});
        sh.clearContents(); sh.getRange(1, 1, rows.length, 3).setValues(rows);
        return json_({ ok: true, added: 0, updated: rows.length - 1 });
      }
      const key = SCHEMA[tab].key; const preserve = body.preserve || [];
      if (body.replace) {
        const rows = objectsToRows(tab, body.rows || []);
        if (sh.getMaxRows() < rows.length + 1) { sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows()); ensureTextFormats_(sh, tab); }
        sh.clearContents(); sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
        return json_({ ok: true, added: rows.length - 1, updated: 0 });
      }
      const values = sh.getDataRange().getValues();
      const existing = rowsToObjects(tab, values);
      const rowOf = new Map(); let n = 0;
      for (let i = 1; i < values.length; i++) if (!isEmptyRow(values[i])) rowOf.set(String(existing[n++][key]), i + 1);
      for (const inc of body.rows || []) {
        const at = rowOf.get(String(inc[key]));
        if (at) {
          const prev = existing.find((o) => String(o[key]) === String(inc[key])) || {};
          const merged = Object.assign({}, inc);
          for (const k of preserve) { const pv = getPath(prev, k); if (pv !== undefined && pv !== null && pv !== "") setPath(merged, k, pv); }
          writeObject_(sh, tab, at, merged); updated++;
        } else { writeObject_(sh, tab, sh.getLastRow() + 1, inc); added++; }
      }
    } finally { lock.releaseLock(); }
    return json_({ ok: true, added, updated });
  } catch (err) { return json_({ ok: false, error: err.message }); }
}
