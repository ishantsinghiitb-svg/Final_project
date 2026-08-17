import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// ── robots.txt (Module 13 · Phase 6) ──
//
// Replaces the static public/robots.txt, which was just "User-agent: * /
// Allow: /" — no Disallow for the private dashboard (defense in depth; the
// real privacy boundary is the per-route noindex meta tag and, for actual
// data, server-side auth — a crawler honoring Disallow is a courtesy, not a
// security control) and no Sitemap directive. Dynamic for the same reason
// sitemap.xml is: the absolute sitemap URL needs the real request origin,
// which a static file can't contain. Must be the only /robots.txt source —
// a static public/robots.txt would otherwise take precedence over this route
// and this file would never actually serve.

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const body = ["User-agent: *", "Allow: /", "Disallow: /dashboard", "", `Sitemap: ${origin}/sitemap.xml`, ""].join(
          "\n",
        );
        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
