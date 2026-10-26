import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // SITE_URL lets a staging host (e.g. a *.pages.dev preview) build with its own canonical/og URLs.
  site: process.env.SITE_URL || "https://ca3.dk",
  // Content lives in src/data/*.json. `npm run build` first pulls the Google Sheet
  // CMS into those files when CMS_URL/CMS_TOKEN are set (scripts/fetch-sheets.mjs);
  // `npm run sync:pure` refreshes publications from the AU research portal.
  build: { format: "directory" },
  devToolbar: { enabled: false },
  integrations: [sitemap({ filter: (page) => !page.includes("/404") })],
});
