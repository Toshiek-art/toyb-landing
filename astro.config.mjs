// @ts-check
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://toyb.space/",
  output: "server",
  adapter: cloudflare(),
  session: {
    driver: "memory",
  },
  integrations: [
    sitemap({
      filter: (page) => {
        try {
          const pathname = new URL(page, "https://toyb.space").pathname;
          return !pathname.startsWith("/admin");
        } catch {
          return !String(page).startsWith("/admin");
        }
      },
    }),
  ],
});
