import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageHero, Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { Reveal } from "@/components/site/Reveal";
import { SUPPORTED_PLATFORM_NAMES } from "@/content/extension";
import { FREE_CREDITS } from "@/content/credits";
import { getBlogPost, BLOG_POSTS, type BlogPost } from "@/content/blog";
import { pageSeo } from "@/content/site";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getBlogPost(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData, params }) => {
    const post: BlogPost = loaderData ?? {
      slug: params.slug,
      title: "OfferLyst Blog",
      description: "Job search, resume and tracking advice from the OfferLyst team.",
      excerpt: "",
      publishedAt: "",
    };
    return {
      ...pageSeo({
        path: `/blog/${post.slug}`,
        title: `${post.title} — OfferLyst Blog`,
        description: post.description,
      }),
      scripts: post.publishedAt
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                headline: post.title,
                description: post.description,
                datePublished: post.publishedAt,
              }),
            },
          ]
        : undefined,
    };
  },
  component: BlogPostPage,
});

function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 text-[15px] leading-relaxed text-muted-foreground [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-foreground">
      {children}
    </div>
  );
}

const CONTENT: Record<string, () => ReactNode> = {
  "track-job-applications": () => (
    <Prose>
      <p>
        A spreadsheet works fine for the first ten applications. By the twentieth, columns go
        stale, statuses don't get updated, and you're reconstructing "did I already apply here?"
        from memory. That's not a discipline problem — it's what happens when a tool built for
        numbers gets used to track a moving, multi-stage process.
      </p>

      <h2>What actually needs tracking</h2>
      <p>A job application isn't one event, it's a sequence: applied, assessment, interview,
      offer, or a rejection at any point along the way. For each application, the things worth
      keeping are:</p>
      <ul>
        <li>The company, role and where you found it</li>
        <li>Which resume version you used — this matters more than people expect once you're
        tailoring per role</li>
        <li>What stage it's at right now, and when it last moved</li>
        <li>Any notes from a screening call or recruiter message</li>
        <li>Interview details once one is scheduled</li>
      </ul>

      <h2>Why spreadsheets stop working</h2>
      <p>
        None of that is hard to store in a spreadsheet. What breaks is <em>keeping it current</em>.
        Updating a status means opening the file, finding the row, editing a cell — friction that's
        just large enough to skip "just this once," which is how a tracker quietly goes stale.
        Interview notes end up in a different document. The resume you actually sent isn't linked
        anywhere, so six months later you can't tell which version got the interview.
      </p>

      <h2>What a dedicated tracker changes</h2>
      <p>
        A board you drag applications across — applied, assessment, interview, offer — keeps the
        status update to one click instead of a spreadsheet edit, so it actually happens. OfferLyst
        keeps the resume you used, your notes and any interviews attached to the application
        itself, so nothing lives in a separate file you'll forget about. If you use the Chrome
        extension on a supported job board, saving a role takes one click instead of copying
        details across by hand.
      </p>
      <p>
        None of this requires switching your whole process overnight. Start by tracking new
        applications going forward — you don't need to backfill everything to get the benefit.
      </p>

      <div className="not-prose mt-8 rounded-2xl border border-white/8 bg-white/[0.02] p-6">
        <p className="font-display text-base font-semibold text-foreground">
          Try it with your next application
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          OfferLyst is free to start, with a {FREE_CREDITS}-credit AI allowance on every account.
        </p>
        <ButtonLink to="/signup" className="mt-4">
          Get Started Free
        </ButtonLink>
      </div>
    </Prose>
  ),
  "free-resume-tools-india": () => (
    <Prose>
      <p>
        Most resumes don't get rejected for lacking qualifications — they get filtered before a
        person ever reads them, usually for reasons that are fixable in an afternoon: formatting
        an applicant tracking system can't parse, generic phrasing that doesn't match what the
        posting actually asked for, or achievements listed without the numbers that make them
        legible at a glance.
      </p>

      <h2>Start with the posting, not a template</h2>
      <p>
        A resume that's identical for every application is easy to spot and easy to skip. The
        highest-leverage free thing you can do is read the posting closely and mirror its actual
        language — the skills and responsibilities it names — in your resume, honestly and only
        where it's true.
      </p>

      <h2>Check the formatting an ATS actually sees</h2>
      <p>
        Applicant tracking systems parse resumes as text before a person sees them. Multi-column
        layouts, text inside images, and unusual fonts can scramble what gets extracted. Simple,
        single-column formatting with standard section headings survives parsing far more
        reliably than something that looks impressive as a PDF but breaks on import.
      </p>

      <h2>Quantify what you can</h2>
      <p>
        "Improved performance" says less than "cut page load time by 40%." Numbers aren't
        available for everything, but wherever they are, they make an achievement easier to
        evaluate at a glance — which matters when a recruiter is spending seconds, not minutes, on
        a first pass.
      </p>

      <h2>Where OfferLyst fits in</h2>
      <p>
        OfferLyst's resume match scores a specific resume against a specific job posting and shows
        where they line up and where they don't, so you're not guessing at what to change. A
        separate ATS check reviews formatting and structure specifically for parseability. Both are
        AI features that use one credit each, and every new account starts with {FREE_CREDITS} free
        credits — enough to try both before deciding if they're useful for your search.
      </p>

      <div className="not-prose mt-8 rounded-2xl border border-white/8 bg-white/[0.02] p-6">
        <p className="font-display text-base font-semibold text-foreground">
          Check a resume against a real posting
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          See the free AI credit allowance and what each check costs.
        </p>
        <ButtonLink to="/pricing" className="mt-4">
          See pricing
        </ButtonLink>
      </div>
    </Prose>
  ),
  "naukri-internshala-linkedin-tracking": () => (
    <Prose>
      <p>
        Most job searches in India don't happen on one site. A search might run across LinkedIn for
        broader roles, Naukri for the largest listing volume, Internshala for internships, and
        Unstop for competitions and campus hiring — each with its own login, its own saved-jobs
        list, and no way to see all of it together.
      </p>

      <h2>The real cost of switching between sites</h2>
      <p>
        The problem isn't using multiple sites — for the Indian job market, that's often
        necessary. It's that each one only shows you what you saved <em>there</em>. A role you
        liked on Naukri last week is invisible while you're browsing Internshala today, so you
        either keep four tabs pinned indefinitely or lose track of roles you meant to revisit.
      </p>

      <h2>One extension, several sites</h2>
      <p>
        The OfferLyst Chrome extension has a dedicated parser for {" "}
        {SUPPORTED_PLATFORM_NAMES.slice(0, -1).join(", ")} and {SUPPORTED_PLATFORM_NAMES.at(-1)}.
        On a supported job or internship page, it reads the posting and shows a panel with what it
        found — title, company, location — with one button to save the role and another to save it
        and start tracking the application, without leaving the page you're on.
      </p>
      <p>
        Whichever site a role came from, it lands in the same place: one library of saved jobs and
        one application board, instead of four separate ones you'd have to check individually.
      </p>

      <h2>You don't need the extension to start</h2>
      <p>
        If a site isn't supported yet, or you'd rather not install anything, you can add a role
        by hand from the dashboard in about the same time it takes to copy-paste the details — you
        just lose the one-click convenience, not the tracking itself.
      </p>

      <div className="not-prose mt-8 rounded-2xl border border-white/8 bg-white/[0.02] p-6">
        <p className="font-display text-base font-semibold text-foreground">
          See which sites are supported
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          The extension is in early access — the Extension page covers how to get it.
        </p>
        <ButtonLink to="/extension" className="mt-4">
          How the extension works
        </ButtonLink>
      </div>
    </Prose>
  ),
};

function BlogPostPage() {
  const post = Route.useLoaderData();
  const render = CONTENT[post.slug];

  return (
    <>
      <PageHero>
        <div className="mx-auto max-w-2xl">
          <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">
            ← Blog
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">
            {new Date(post.publishedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="mt-2 font-display text-fluid-hero font-semibold tracking-tight text-balance">
            {post.title}
          </h1>
        </div>
      </PageHero>

      <Reveal>
        <Section spacing="last">{render ? render() : null}</Section>
      </Reveal>
    </>
  );
}
