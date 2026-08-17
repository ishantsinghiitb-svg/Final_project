import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHero, Section } from "@/components/site/Section";
import { Reveal } from "@/components/site/Reveal";
import { BLOG_POSTS } from "@/content/blog";
import { pageSeo } from "@/content/site";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    ...pageSeo({
      path: "/blog",
      title: "Blog — Job Search, Resume & Tracking Tips — OfferLyst",
      description:
        "Practical advice on tracking job applications, tailoring your resume, and using the job boards Indian job seekers actually use.",
      ogDescription: "Job search, resume and tracking advice from the OfferLyst team.",
    }),
  }),
  component: BlogIndex,
});

function BlogIndex() {
  return (
    <>
      <PageHero>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
            Blog
          </span>
          <h1 className="mt-5 font-display text-fluid-hero font-semibold tracking-tight">
            Job search, resume and tracking advice.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-fluid-lead text-muted-foreground">
            Practical notes, not filler. Written for the job search most people are actually
            running.
          </p>
        </div>
      </PageHero>

      <Reveal>
        <Section spacing="last">
          <div className="mx-auto grid max-w-3xl gap-4">
            {BLOG_POSTS.map((post) => (
              <Link
                key={post.slug}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="card-hover group rounded-2xl border border-white/8 bg-white/[0.02] p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60"
              >
                <p className="text-xs text-muted-foreground">
                  {new Date(post.publishedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <p className="mt-2 font-display text-fluid-h3 font-semibold">{post.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#93C5FD]">
                  Read more{" "}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </Section>
      </Reveal>
    </>
  );
}
