/**
 * Blog post metadata (Module 13 · Phase 6). Deliberately not a CMS or MDX
 * pipeline — three posts, hand-written, body content lives directly in
 * src/routes/blog.$slug.tsx next to this metadata. If this ever needs to
 * grow past a handful of posts, that's the point to reconsider the approach,
 * not a reason to build more here now.
 *
 * Every claim in every post is grounded in what's on Features/FAQ/Pricing —
 * no invented statistics, no fabricated user counts, no fake testimonials.
 */
export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  publishedAt: string; // ISO date
};

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: "track-job-applications",
    title: "How to Track Job Applications Without Losing Your Mind",
    description:
      "A practical system for tracking job applications: what to record, why spreadsheets stop working, and how a dedicated tracker keeps every application in one place.",
    excerpt:
      "Spreadsheets work for the first ten applications. After that, here's what actually keeps a job search organized.",
    publishedAt: "2026-08-20",
  },
  {
    slug: "free-resume-tools-india",
    title: "Free Resume Tools for Job Seekers in India",
    description:
      "Free ways to check your resume against a job posting, catch ATS formatting issues, and tailor your resume for Indian job boards like Naukri and Internshala.",
    excerpt:
      "You don't need a paid resume service to catch the mistakes that get resumes filtered out before a human sees them.",
    publishedAt: "2026-08-20",
  },
  {
    slug: "naukri-internshala-linkedin-tracking",
    title: "Naukri, Internshala, LinkedIn: Tracking Internships and Jobs in One Place",
    description:
      "Applying across Naukri, Internshala, LinkedIn, Unstop and other Indian job boards creates scattered tabs and lost track of applications. Here's how to bring it together.",
    excerpt:
      "Four job boards, four sets of logins, four ways to lose track of where you applied. There's a simpler way.",
    publishedAt: "2026-08-20",
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
