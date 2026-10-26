import site from "../data/site.json";
import pillars from "../data/pillars.json";
import testbeds from "../data/testbeds.json";
import members from "../data/members.json";
import publications from "../data/publications.json";
import posts from "../data/posts.json";
import stats from "../data/stats.json";

export { site, pillars, testbeds, members, publications, posts, stats };

export const memberIdByName: Record<string, string> = Object.fromEntries(members.map((m: any) => [m.name, m.id]));

export const byDate = <T extends { date: string }>(a: T[]) => a.slice().sort((x, y) => (x.date < y.date ? 1 : -1));
export const featured = () => publications.filter((p: any) => p.featured).sort((a: any, b: any) => a.featured - b.featured);
export const pubsByAuthor = (name: string) => publications.filter((p: any) => p.authors.includes(name));
export const postsBy = (name: string) => byDate(posts.filter((p: any) => p.by === name));
export const pubsIn = (key: "pillar" | "testbed", value: string) => publications.filter((p: any) => p[key] === value);

/* post bodies are plain text; escape them and turn bare URLs into links */
export const linkify = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string))
   .replace(/(https?:\/\/[^\s<]+?)([.,;:!?)]*)(?=\s|$)/g, (_, u, tail) => `<a href="${u}" target="_blank" rel="noreferrer">${u.replace(/^https?:\/\//, "")}</a>${tail}`);

export const initials = (n: string) =>
  n.split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
export const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

export const GROUPS: [string, string][] = [["faculty", "Faculty"], ["current", "Current members"], ["alumni", "Alumni"], ["external", "External collaborators"]];

export const counts = <T>(arr: T[], f: (x: T) => any) => {
  const m: Record<string, number> = {};
  arr.forEach((x) => { const k = f(x); if (k != null) m[k] = (m[k] || 0) + 1; });
  return Object.keys(m).sort().map((k) => ({ k, n: m[k] }));
};
