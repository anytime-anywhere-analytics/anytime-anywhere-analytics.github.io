#!/usr/bin/env node
/**
 * Pull Niklas Elmqvist's own LinkedIn posts (no reposts) into src/data/posts.json.
 *
 *   node scripts/fetch-linkedin.mjs             # fetch, merge into posts.json
 *   node scripts/fetch-linkedin.mjs --replace   # drop every existing LinkedIn post first
 *   node scripts/fetch-linkedin.mjs --max 40    # stop after ~40 posts
 *
 * LinkedIn serves HTTP 999 to anything that is not a logged-in browser, so like
 * fetch-pure.mjs this drives a real Chrome window over the DevTools protocol,
 * using the persistent profile in .cache/chrome-profile. The first run shows a
 * login page: sign in in that window and the script carries on by itself. Post
 * images are copied to public/assets/img/news/.
 *
 * Posts written here carry `source: "linkedin"` and `link` (the post URL). Edit
 * the title/dek/tag freely in posts.json — a re-run keeps hand edits and only
 * adds posts it has not seen before.
 */
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/data/posts.json");
const IMG_DIR = join(ROOT, "public/assets/img/news");
const PROFILE = "niklaselmqvist";
const AUTHOR = "Niklas Elmqvist";
const FEED = `https://www.linkedin.com/in/${PROFILE}/recent-activity/all/`;

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : dflt; };
const maxPosts = parseInt(arg("--max", "400"), 10);
const replace = process.argv.includes("--replace");
const port = parseInt(arg("--port", "9333"), 10);
const CHROME = arg("--chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Chrome over the DevTools protocol (same as fetch-pure.mjs) ─────────── */
async function ensureChrome() {
  try { await fetch(`http://localhost:${port}/json/version`); return null; } catch {}
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; pass --chrome <path>`);
  const profile = join(ROOT, ".cache/chrome-profile");
  const child = spawn(CHROME, ["--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1100,900", "about:blank"], { stdio: "ignore", detached: true });
  for (let i = 0; i < 40; i++) { await sleep(250); try { await fetch(`http://localhost:${port}/json/version`); return child; } catch {} }
  throw new Error("Chrome did not start");
}

async function connect() {
  const pages = await (await fetch(`http://localhost:${port}/json`)).json();
  const t = pages.find((x) => x.type === "page") || (await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: "PUT" })).json());
  /* the tab must be the visible one: LinkedIn only renders feed items that scroll into a foreground viewport */
  await fetch(`http://localhost:${port}/json/activate/${t.id}`).catch(() => {});
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
  return { send, evaluate, close: () => ws.close() };
}

/* ── in-page extractor ─────────────────────────────────────────────────── */
const parseFeed = String(() => {
  const txt = (el) => (el ? el.innerText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "");
  const out = [];
  for (const el of document.querySelectorAll("[data-urn^='urn:li:activity:'], [data-id^='urn:li:activity:']")) {
    const urn = el.getAttribute("data-urn") || el.getAttribute("data-id");
    const activityId = (urn.match(/activity:(\d+)/) || [])[1];
    if (!activityId) continue;
    const header = txt(el.querySelector(".update-components-header"));
    const actor = txt(el.querySelector(".update-components-actor__title, .update-components-actor__name"));
    const repost = /reposted/i.test(header) || (!!el.querySelector(".update-components-mini-update-v2") && !el.querySelector(".update-components-text"));
    /* commentary is inline spans + mention links with <br> line breaks; innerText would
       break lines around mentions, so read textContent off a clone with the <br>s swapped */
    const commentary = (root) => {
      if (!root) return "";
      const c = root.cloneNode(true);
      c.querySelectorAll(".visually-hidden, .a11y-text, button").forEach((n) => n.remove());
      c.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
      return c.textContent.replace(/[ \t\u00a0]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    };
    const text = commentary(el.querySelector(".update-components-text, .feed-shared-update-v2__description"));
    const images = [...el.querySelectorAll(".update-components-image img, .update-components-image__image, .feed-shared-image img")]
      .map((i) => i.currentSrc || i.src).filter((s) => s && /licdn\.com/.test(s) && !/profile-displayphoto/.test(s));
    const article = el.querySelector(".update-components-article a[href]");
    const doc = el.querySelector(".update-components-document__container, .update-components-document");
    const video = !!el.querySelector(".update-components-linkedin-video, video");
    const quoted = commentary(el.querySelector(".update-components-mini-update-v2 .update-components-text"));
    out.push({
      activityId, actor, header, repost, text, images,
      article: article ? { href: article.href, title: txt(article.querySelector(".update-components-article__title")) || txt(article) } : null,
      document: doc ? txt(doc.querySelector(".update-components-document__title, h2, h3")) || "document" : null,
      video, quoted: quoted && quoted !== text ? quoted : null,
    });
  }
  return out;
});

/* ── post shaping ──────────────────────────────────────────────────────── */
const TAGS = [
  [3, "Hiring", /\b(hiring|hire|recruit\w*|open (ph\.?d\.?|postdoc\w*|faculty)? ?positions?|positions? (open|available)|ph\.?d\.? (position|student position|fellowship)|postdoc\w* (position|scholar|opening)|apply (now|by|here|before)|vacanc\w*|job (opening|ad|posting)|come work with|be my colleague|join (me|us|my (group|team|center|centre)))\b/gi],
  [2.5, "Award", /\b(awards?|honou?rable mention|best paper|prize|distinguished|recogni[sz]ed|test of time|fellow(ship)? of|nominat\w+|honor(ed)?)\b/gi],
  [2, "Blog", /\b(blog ?post|new blog|my (latest|recent|new) (post|ruminations|essay|piece)|i wrote about|medium\.com|substack|newsletter)\b/gi],
  [2, "Press", /\b(interview\w*|podcast|featured in|news article|magazine|press|coverage|wrote about us)\b/gi],
  [2, "Team", /\b(welcome\w*|joined|joining|new member|defen[cs]e|defended|graduat\w+|farewell|visiting us|visitor|congrat\w+|my (stellar|brilliant|new) (postdoc|student|colleague))\b/gi],
  [1.5, "Talk", /\b(keynote|invited talk|talk|seminar|lecture|panel(ist)?|presenting|presentation|speaking at|speaker)\b/gi],
  [1.5, "Release", /\b(release[sd]?|open[- ]source|github|v\d+\.\d|now available|launch\w*|demo)\b/gi],
  [1.5, "Grant", /\b(grants?|funding|funded|villum|foundation|dff|erc|investigator)\b/gi],
  [1, "Paper", /\b(papers?|accepted|published|preprint|arxiv|article|proceedings|camera[- ]ready|to appear|journal|tvcg|uist|ieee vis|chi ?'?\d\d|reviewers?|reviewing|program committee)\b/gi],
  [1, "Event", /\b(workshop|conference|symposium|summer school|hackathon|meetup|dagstuhl|visit(ed|ing)?|trip|happening (today|this))\b/gi],
];
/* weighted hit count (capped, so a word repeated ten times does not win); ties go to the earlier rule */
const tagOf = (text) => {
  let best = "Update", bestN = 0;
  for (const [w, tag, re] of TAGS) { const n = Math.min(3, (text.match(re) || []).length) * w; if (n > bestN) { best = tag; bestN = n; } }
  return best;
};

const slugify = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/* LinkedIn activity ids carry their creation time in the top 41 bits */
const dateOf = (activityId) => new Date(Number(BigInt(activityId) >> 22n)).toISOString().slice(0, 10);

function shape(raw) {
  const clean = raw.text.replace(/\s*…\s*more$/i, "").trim();
  const paras = clean.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
  const isUrl = (s) => /^(https?:\/\/\S+|[\w-]+:\s*https?:\/\/\S+)$/i.test(s);
  const first = paras.find((s) => !isUrl(s)) || raw.article?.title || "LinkedIn update";
  /* title: the first sentence (not an abbreviation), trimmed of trailing links */
  const sentence = (first.match(/^(.{20,160}?(?<!\b(?:Ph\.D|Dr|Prof|Drs|vs|e\.g|i\.e|et al|no|approx|U\.S|Mr|Ms|St|[A-Z]))[.!?])(\s|$)/i)?.[1] || first)
    .replace(/[:\s-]*https?:\/\/\S+.*$/, "").replace(/\s*[:;,-]$/, "").trim();
  const title = sentence.length > 120 ? sentence.slice(0, 117).replace(/\s+\S*$/, "") + "…" : sentence.replace(/[.!?]$/, "");
  const restOfFirst = first.slice(sentence.length).trim();
  const dekSrc = (restOfFirst || paras.filter((s) => s !== first && !isUrl(s))[0] || "").replace(/^[\s.,;:-]+/, "");
  const dek = dekSrc.length > 200 ? dekSrc.slice(0, 197).replace(/\s+\S*$/, "") + "…" : dekSrc;
  const date = dateOf(raw.activityId);
  const kind = clean.length > 700 || paras.length > 4 ? "long" : "short";
  const post = {
    id: `${date}-${slugify(title).split("-").slice(0, 6).join("-")}`,
    tag: tagOf(clean),
    date,
    title,
    dek,
    body: paras,
    kind,
    by: AUTHOR,
    source: "linkedin",
    link: `https://www.linkedin.com/feed/update/urn:li:activity:${raw.activityId}/`,
  };
  if (raw.article) post.article = raw.article;
  if (raw.video) post.video = true;
  if (raw.quoted) post.quoted = raw.quoted;
  return post;
}

/* ── image download: node fetch first, then from inside the tab ─────────── */
async function saveImage(tab, url, name) {
  const file = join(IMG_DIR, name + ".jpg");
  if (existsSync(file)) return `/assets/img/news/${name}.jpg`;
  let buf = null;
  try { const r = await fetch(url); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); } catch {}
  if (!buf) {
    try {
      const b64 = await tab.evaluate(`fetch(${JSON.stringify(url)}).then(r => r.blob()).then(b => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result.split(",")[1]); f.readAsDataURL(b); }))`);
      if (b64) buf = Buffer.from(b64, "base64");
    } catch {}
  }
  if (!buf || buf.length < 2000) return null;
  await writeFile(file, buf);
  return `/assets/img/news/${name}.jpg`;
}

/* ── crawl ─────────────────────────────────────────────────────────────── */
await mkdir(IMG_DIR, { recursive: true });
const chrome = await ensureChrome();
const tab = await connect();
await tab.send("Page.navigate", { url: FEED });

console.log("waiting for the activity feed (sign in to LinkedIn in the Chrome window if it asks)…");
const t0 = Date.now();
let ready = false, lastNav = Date.now();
while (Date.now() - t0 < 6 * 60 * 1000) {
  await sleep(1500);
  try {
    const state = await tab.evaluate(`(() => {
      const onActivity = location.pathname.startsWith(${JSON.stringify(`/in/${PROFILE}/recent-activity`)});
      if (onActivity && document.querySelector("[data-urn^='urn:li:activity:'], [data-id^='urn:li:activity:']")) return "feed";
      if (/login|authwall|checkpoint|signup|uas[/]/.test(location.pathname)) return "login";
      return onActivity ? "loading" : "elsewhere";
    })()`);
    if (state === "feed") { ready = true; break; }
    /* after signing in LinkedIn lands on the home feed; steer back to the profile activity */
    if (state === "elsewhere" && Date.now() - lastNav > 5000) { lastNav = Date.now(); await tab.send("Page.navigate", { url: FEED }); }
    if (state === "login" && Date.now() - t0 > 20000 && (Date.now() - t0) % 30000 < 1500) console.log("  still on the login page…");
  } catch (e) { if (!/context was destroyed|Cannot find context/.test(e.message)) console.warn("  " + e.message); }
}
if (!ready) { console.error("gave up waiting for the feed"); process.exit(1); }

/* posts render lazily as their placeholders enter the viewport, so walk down the
   page a screen at a time; at the bottom LinkedIn appends the next batch */
const count = () => tab.evaluate(`document.querySelectorAll("[data-urn^='urn:li:activity:'], [data-id^='urn:li:activity:']").length`);
await tab.evaluate(`(() => { history.scrollRestoration = "manual"; document.scrollingElement.scrollTop = 0; return true; })()`);
await sleep(1000);
let seen = 0, stale = 0;
while (stale < 12) {
  const atBottom = await tab.evaluate(`(() => { const d = document.scrollingElement; d.scrollTop += innerHeight * 0.7; return d.scrollTop + innerHeight >= d.scrollHeight - 5; })()`);
  await sleep(atBottom ? 1500 : 350);
  if (atBottom) await tab.evaluate(`(() => { const b = document.querySelector("button.scaffold-finite-scroll__load-button"); if (b) b.click(); return true; })()`);
  const n = await count();
  if (n > seen) { seen = n; stale = 0; if (n % 10 < 3 || atBottom) console.log(`  ${n} updates loaded`); } else if (atBottom) stale++;
  if (n >= maxPosts) break;
}
/* expand every "…more" so the full text is in the DOM, then read it all */
await tab.evaluate(`document.querySelectorAll("button.feed-shared-inline-show-more-text__see-more-less-toggle, .update-components-text button").forEach(b => { try { b.click(); } catch {} }); true`);
await sleep(800);
const raw = await tab.evaluate(`(${parseFeed})()`);
const own = raw.filter((r) => !r.repost && (!r.actor || r.actor.startsWith(AUTHOR)) && (r.text.length >= 60 || (r.text && r.images.length)));
console.log(`${raw.length} updates in feed, ${raw.length - own.length} reposts/empty skipped, ${own.length} own posts`);

let existing = [];
try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch {}
if (replace) existing = existing.filter((p) => p.source !== "linkedin");
const known = new Map(existing.filter((p) => p.link).map((p) => [p.link, p]));

const added = [];
for (const r of own) {
  const post = shape(r);
  if (known.has(post.link)) continue;
  if (r.images.length) {
    const img = await saveImage(tab, r.images[0], post.id);
    if (img) post.image = img;
    const extra = [];
    for (let i = 1; i < Math.min(r.images.length, 6); i++) { const x = await saveImage(tab, r.images[i], `${post.id}-${i + 1}`); if (x) extra.push(x); }
    if (extra.length) post.images = extra;
  }
  existing.push(post);
  added.push(post);
  console.log(`  + ${post.date} [${post.tag}] ${post.title}${post.image ? " (image)" : ""}`);
}
existing.sort((a, b) => (a.date < b.date ? 1 : -1));
await writeFile(OUT, JSON.stringify(existing, null, 2) + "\n");
console.log(`wrote ${existing.length} posts (${added.length} new) → ${OUT}`);
tab.close();
if (chrome) chrome.kill();
process.exit(0);
