/**
 * Shrink heavy raster images in the built site (runs between `astro build` and pagefind).
 *
 *   node scripts/optimize-images.mjs            # optimise dist/
 *
 * Content images are referenced by path from the sheet, and editors drop whatever they
 * have into Drive — often multi-megabyte PNGs. Every .png/.jpg under dist/assets/ larger
 * than LIMIT is resized to fit MAX px and re-encoded as WebP next to the original, and
 * root-relative references in the built HTML/CSS ("/assets/img/rp1.png") are pointed at
 * the .webp. Absolute URLs (og:image) keep the original, since some link-preview
 * crawlers still reject WebP. Sources in public/ and Drive are never touched.
 */
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import sharp from "sharp";

const DIST = join(import.meta.dirname, "..", "dist");
const LIMIT = 300 * 1024;
const MAX = 1600;

const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((d) =>
  d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))).flat();
const exists = (p) => stat(p).then(() => true, () => false);
const kb = (n) => `${Math.round(n / 1024)} KB`;

const swaps = new Map();
let before = 0, after = 0;
for (const file of await walk(join(DIST, "assets"))) {
  if (!/\.(png|jpe?g)$/i.test(file)) continue;
  const size = (await stat(file)).size;
  if (size <= LIMIT) continue;
  const out = file.replace(/\.(png|jpe?g)$/i, ".webp");
  const url = "/" + relative(DIST, file).split(sep).join("/");
  if (await exists(out)) { console.warn(`  ⚠ ${url}: ${relative(DIST, out)} already exists — left as is`); continue; }
  const buf = await sharp(file).rotate().resize(MAX, MAX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  if (buf.length > size * 0.7) continue;
  await writeFile(out, buf);
  swaps.set(url, url.replace(/\.(png|jpe?g)$/i, ".webp"));
  before += size; after += buf.length;
  console.log(`  ✓ ${url} ${kb(size)} → ${kb(buf.length)}`);
}

if (swaps.size) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // only root-relative uses: preceded by a quote, paren, space or comma (srcset), never by a host
  const re = new RegExp(`(?<=["'(\\s,])(${[...swaps.keys()].map(esc).join("|")})(?=["')\\s,?#])`, "g");
  let pages = 0;
  for (const file of await walk(DIST)) {
    if (!/\.(html|css)$/.test(file)) continue;
    const s = await readFile(file, "utf8");
    const t = s.replace(re, (m) => swaps.get(m));
    if (t !== s) { await writeFile(file, t); pages++; }
  }
  console.log(`Images: ${swaps.size} re-encoded, ${kb(before)} → ${kb(after)}, ${pages} file(s) rewritten`);
} else {
  console.log("Images: nothing over the limit");
}
