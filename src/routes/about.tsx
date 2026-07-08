import { createFileRoute } from "@tanstack/react-router";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — NextOffer" },
      { name: "description", content: "NextOffer is a small team building the calmest way to find your next job." },
      { property: "og:title", content: "About — NextOffer" },
      { property: "og:description", content: "Our mission, our team, and why we're building NextOffer." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <>
      <Section
        eyebrow="About"
        title="We're building the calmest way to find your next job."
        description="Job hunting is one of the most stressful things people do. It shouldn't happen in browser tabs, spreadsheets and doc versions. NextOffer is the workspace we always wished existed."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { t: "Craft over volume", d: "One tailored application beats fifty generic ones. Our AI helps you send fewer, better." },
            { t: "Your data, yours", d: "Encrypted at rest, exportable at any time. We'll never sell resumes or applications." },
            { t: "Beautiful is a feature", d: "Job search feels heavy enough. Our product should feel light in your hand." },
          ].map((v) => (
            <div key={v.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
              <p className="font-display text-lg font-semibold">{v.t}</p>
              <p className="mt-2 text-sm text-muted-foreground">{v.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The team">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[
            { n: "Aria Chen", r: "Cofounder, Product" },
            { n: "Sam Patel", r: "Cofounder, Engineering" },
            { n: "Noah Kim", r: "Design" },
            { n: "Zoë Ivanov", r: "Growth" },
          ].map((p) => (
            <div key={p.n} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <div className="h-32 rounded-xl bg-gradient-to-br from-[oklch(0.4_0.18_260)] to-[oklch(0.3_0.2_290)]" />
              <p className="mt-4 font-semibold">{p.n}</p>
              <p className="text-xs text-muted-foreground">{p.r}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="pb-32">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-10 md:p-14">
          <h3 className="font-display text-3xl font-semibold md:text-4xl">Join us on the ride.</h3>
          <p className="mt-3 max-w-xl text-muted-foreground">We're small, funded, and hiring for engineering and product. Come build the workspace we all wished existed.</p>
          <div className="mt-6 flex gap-3">
            <ButtonLink to="/contact" size="lg">See open roles</ButtonLink>
            <ButtonLink to="/signup" size="lg" variant="outline">Try the product</ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}