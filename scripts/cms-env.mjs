/** shared bits for the Sheets CMS scripts: env, endpoint, file map */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env — use the real environment */ }

export const CMS_URL = (process.env.CMS_URL || "").trim();
export const CMS_TOKEN = (process.env.CMS_TOKEN || "").trim();
export const configured = Boolean(CMS_URL && CMS_TOKEN);

/** file name (src/data/<name>.json) → sheet tab */
export const TAB_OF = { site: "Site", pillars: "Pillars", testbeds: "Testbeds", members: "Members", posts: "Posts", publications: "Publications", stats: "Stats" };
export const FILES = Object.keys(TAB_OF);

export function explainUnconfigured() {
  console.log(
    "Sheets CMS not configured — set CMS_URL (the Apps Script web-app /exec URL) and CMS_TOKEN\n" +
    "(from the sheet's CA³ CMS → Set API token…) in the environment or in a .env file. See README.",
  );
}

export async function callCms(init = {}, params = {}) {
  const u = new URL(CMS_URL);
  u.searchParams.set("token", CMS_TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { redirect: "follow", ...init });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`CMS returned ${res.status} and non-JSON (${text.slice(0, 200).replace(/\s+/g, " ")}…) — is the web app deployed with access "Anyone"?`); }
  if (!body.ok) throw new Error(`CMS error: ${body.error}`);
  return body;
}
