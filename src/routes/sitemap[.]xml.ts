import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { SITE_URL } from "@/content/site";

// ── sitemap.xml (Module 13 · Phase 6) ──
//
// Bug fix: BASE_URL used to be a hardcoded empty string, which made every
// <loc> a relative path ("/features" instead of "https://.../features") —
// a sitemap-protocol violation that risks crawlers rejecting the file
// outright. Prefer the configured canonical origin (VITE_SITE_URL) so every
// <loc> is the public getofferlyst.com URL even when this file is fetched on
// the raw workers.dev origin; fall back to the request origin (correct in
// dev and any preview deployment) when it is unset.

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = SITE_URL || new URL(request.url).origin;
        const entries = [
          { path: "/", priority: "1.0", changefreq: "weekly" },
          { path: "/features", priority: "0.9", changefreq: "monthly" },
          { path: "/pricing", priority: "0.8", changefreq: "monthly" },
          { path: "/extension", priority: "0.9", changefreq: "monthly" },
          { path: "/about", priority: "0.7", changefreq: "monthly" },
          { path: "/faq", priority: "0.6", changefreq: "monthly" },
          { path: "/blog", priority: "0.6", changefreq: "weekly" },
          { path: "/blog/track-job-applications", priority: "0.5", changefreq: "monthly" },
          { path: "/blog/free-resume-tools-india", priority: "0.5", changefreq: "monthly" },
          {
            path: "/blog/naukri-internshala-linkedin-tracking",
            priority: "0.5",
            changefreq: "monthly",
          },
          { path: "/contact", priority: "0.6", changefreq: "monthly" },
          { path: "/privacy", priority: "0.3", changefreq: "yearly" },
          { path: "/terms", priority: "0.3", changefreq: "yearly" },
          { path: "/login", priority: "0.4" },
          { path: "/signup", priority: "0.7" },
        ];
        const urls = entries
          .map(
            (e) =>
              `  <url>\n    <loc>${origin}${e.path}</loc>\n    ${
                e.changefreq ? `<changefreq>${e.changefreq}</changefreq>\n    ` : ""
              }<priority>${e.priority}</priority>\n  </url>`,
          )
          .join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
