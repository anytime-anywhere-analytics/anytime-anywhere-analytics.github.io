/**
 * Turn raw Pure research-portal records (as scraped by fetch-pure.mjs) into
 * the flat shape src/data/publications.json uses on the site.
 *
 * Hand-curated fields — id, pillar, testbed, featured, hook, image, pdf,
 * video — live only in publications.json, so `merge` carries them over from
 * the previous file (matched by portal URL) rather than regenerating them.
 */

const JOURNALS = {
  "IEEE Transactions on Visualization and Computer Graphics": "IEEE TVCG",
  "Information Visualization": "Information Visualization",
  "Computer Graphics Forum": "Computer Graphics Forum",
  "IEEE Computer Graphics and Applications": "IEEE CG&A",
  "International Journal of Human Computer Studies": "IJHCS",
  "International Journal of Human-Computer Interaction": "IJHCI",
  "Proceedings of the ACM on Human-Computer Interaction": "PACM HCI",
  "ACM Computing Surveys": "ACM Computing Surveys",
  "CEUR Workshop Proceedings": "CEUR Workshop Proceedings",
  "Journal of the American Medical Informatics Association": "JAMIA",
  "Communications of the ACM": "Communications of the ACM",
  "Journal of Research in Science Teaching": "JRST",
  "Bioinformatics": "Bioinformatics",
  "Nucleic Acids Research": "Nucleic Acids Research",
  "AMIA ... Annual Symposium proceedings. AMIA Symposium": "AMIA Annual Symposium",
  "Computers and Graphics (Pergamon)": "Computers & Graphics",
};

/* matched, in order, against host publication + conference + event text */
const PROCEEDINGS = [
  [/Extended Abstracts.*CHI|CHI.*Extended Abstracts|CHI EA/i, "ACM CHI EA"],
  [/\bCHI\b/, "ACM CHI"],
  [/\bUIST\b/, "ACM UIST"],
  [/PacificVis|Pacific Visuali[sz]ation/i, "IEEE PacificVis"],
  [/VL\/HCC/, "IEEE VL/HCC"],
  [/Human Factors in Immersive Analytics|HFIA/, "IEEE HFIA"],
  [/PLATEAU/, "PLATEAU"],
  [/ASSETS/, "ACM ASSETS"],
  [/ISMAR/, "IEEE ISMAR"],
  [/\bDIS\b/, "ACM DIS"],
  [/Advanced Visual Interfaces|\bAVI\b/, "ACM AVI"],
  [/HICSS|Hawaii International Conference/, "HICSS"],
  [/Machine Learning from User Interaction|MLUI/, "IEEE MLUI"],
  [/Visualization in Data Science|\bVDS\b/, "IEEE VDS"],
  [/iConference/, "iConference"],
  [/Artificial Intelligence and Virtual Reality|AIVR/, "IEEE AIVR"],
  [/Beyond Time and Errors|BELIV/, "BELIV"],
  [/Visual Analytics Science and Technology|VAST/, "IEEE VAST"],
  [/Graphics Interface/, "Graphics Interface"],
  [/Computer Supported Collaborative Learning|CSCL/, "CSCL"],
  [/MobileHCI/, "ACM MobileHCI"],
  [/Design Engineering Technical Conferences|Dynamics for Design/, "ASME IDETC"],
  [/Spatial User Interaction|\bSUI\b/, "ACM SUI"],
  [/Dagstuhl/, "Dagstuhl Seminar"],
  [/Interactive Tabletops|\bITS\b/, "ACM ITS"],
  [/EuroVA/, "EuroVA"],
  [/INTERACT/, "IFIP INTERACT"],
  [/Virtual Reality Software and Technology|VRST/, "ACM VRST"],
  [/IEEE Virtual Reality|VR'07/, "IEEE VR"],
  [/Software Visualization|SOFTVIS|SoftVis/i, "ACM SoftVis"],
  [/Human Factors and Ergonomics Society|HFES/, "HFES"],
  [/InfoVis/, "IEEE InfoVis"],
  [/Lecture Notes in Computer Science/, "Springer LNCS"], // last: INTERACT, iConference, Dagstuhl volumes are LNCS too
];

/* Pure spells some people several ways; use the spelling members.json uses */
const AUTHORS = {
  "N. Elmqvist": "Niklas Elmqvist", "Nikias Elmqvist": "Niklas Elmqvist", "Niklas Elmqvis": "Niklas Elmqvist", "Elmqvist Niklas": "Niklas Elmqvist",
  "Tsigas Philippas": "Philippas Tsigas", "Nathalie Henry": "Nathalie H. Riche",
  "S. Shin": "Sungbok Shin",
  "Caroline Palma Berger": "Caroline Berger",
  "A. Batch": "Andrea Batch",
  "Brian D. Ondov": "Brian Ondov",
  "Sriram Karthik Badam": "Sriram K. Badam", "S. Karthik Badam": "Sriram K. Badam",
  "A. Bezerianos": "Anastasia Bezerianos",
  "P. Dragicevic": "Pierre Dragicevic",
  "Jean Daniel Fekete": "Jean-Daniel Fekete", "J. D. Fekete": "Jean-Daniel Fekete",
  "Nathalie Henry Riche": "Nathalie H. Riche", "N. Henry Riche": "Nathalie H. Riche",
  "D. S. Ebert": "David S. Ebert", "David Ebert": "David S. Ebert",
  "Anton Sutje Wolter": "Anton Wolter",
  "Mehmet Adil Yalçin": "Mehmet Adil Yalcin", "M. Adil Yalçin": "Mehmet Adil Yalcin", "Adil Yalçin": "Mehmet Adil Yalcin",
  "Eli Fisher": "Eli Raymond Fisher",
  "S. Ghani": "Sohaib Ghani",
  "W. Javed": "Waqas Javed",
  "Kyung Tae Kim": "KyungTae Kim", "Kyungtae Kim": "KyungTae Kim",
  "S. MacNeil": "Stephen MacNeil",
  "Deokgun Park": "Deok Gun Park",
  "Yuet Ling Wong": "Yuetling Wong",
  "J. S. Yi": "Ji Soo Yi",
  "P. W.S. Butcher": "Peter W.S. Butcher",
  "P. D. Ritsos": "Panagiotis D. Ritsos",
  "F. Chevalier": "Fanny Chevalier",
};

const propText = (v) => (v == null ? "" : typeof v === "string" ? v : v.text || "");

export function venueOf(rec) {
  const p = rec.properties || {};
  const journal = propText(p["Journal"]);
  if (journal) return JOURNALS[journal] || journal;
  const hay = ["Title of host publication", "Conference", "Event", "Series"].map((k) => propText(p[k])).join(" | ");
  for (const [re, name] of PROCEEDINGS) if (re.test(hay)) return name;
  if (/arxiv/i.test(propText(p["Publisher"])) || rec.links?.some((l) => /arxiv\.org/.test(l.href))) return "arXiv";
  if (rec.type?.classification?.includes("Preprint")) return "Preprint";
  return hay.split(" | ").find(Boolean) || "";
}

export function typeOf(rec) {
  const c = rec.type?.classification?.[0] || "";
  if (/Book chapter/.test(c)) return "chapter";
  if (/Preprint/.test(c)) return "preprint";
  if (/proceedings|^Paper$/i.test(c)) return "conf";
  return "jrnl";
}

const slugify = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** short readable id: the system name before a colon or dash, else the first six words */
export function slugOf(title) {
  const t = title.replace(/['’]/g, "");
  const m = t.match(/^(.{2,60}?)(?::\s|\s[–—-]\s)/);
  const base = m ? m[1] : t.split(/\s+/).slice(0, 6).join(" ");
  return slugify(base.replace(/^[“"‘]+|[”"’]+$/g, ""));
}

export function toSite(rec, prev = {}) {
  const pdf = prev.pdf
    || rec.documents?.find((d) => /\.pdf$/i.test(d.href || ""))?.href
    || rec.links?.find((l) => /arxiv\.org|\.pdf$/i.test(l.href) && !/scopus/.test(l.href))?.href;
  const out = {
    type: typeOf(rec),
    id: prev.id || slugOf(rec.title),
    title: rec.title,
    authors: rec.authors.map((a) => AUTHORS[a.name] || a.name),
    venue: venueOf(rec),
    year: rec.year,
    pillar: prev.pillar ?? null,
    testbed: prev.testbed ?? null,
  };
  if (prev.featured) out.featured = prev.featured;
  if (prev.hook) out.hook = prev.hook;
  out.abstract = rec.abstract || [];
  out.keywords = rec.keywords || [];
  if (prev.image) out.image = prev.image;
  if (pdf) out.pdf = pdf;
  if (prev.video) out.video = prev.video;
  if (rec.dois?.[0]) out.doi = rec.dois[0];
  out.portal = rec.portal;
  return out;
}

/**
 * Build the full publications list from Pure records, carrying curated fields
 * over from `existing` (matched by portal URL). Ids are made unique by
 * suffixing the year, then a counter.
 */
export function merge(records, existing = []) {
  const prevByPortal = new Map(existing.map((p) => [p.portal, p]));
  const sorted = records.slice().sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
  const seen = new Set(existing.map((p) => p.id));
  const out = [];
  for (const rec of sorted) {
    const prev = prevByPortal.get(rec.portal);
    const pub = toSite(rec, prev);
    if (!prev) {
      let id = pub.id;
      if (seen.has(id)) id = `${pub.id}-${rec.year}`;
      for (let n = 2; seen.has(id); n++) id = `${pub.id}-${rec.year}-${n}`;
      pub.id = id;
    }
    seen.add(pub.id);
    out.push(pub);
  }
  return out;
}
