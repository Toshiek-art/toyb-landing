import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = () => {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin/",
    "Disallow: /api/admin",
    "Disallow: /api/admin/",
    "",
    "Sitemap: https://toyb.space/sitemap-index.xml",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
