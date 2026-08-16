import { createFileRoute, Link } from "@tanstack/react-router";
import { Chrome, Mail, Sparkles } from "lucide-react";
import { Section } from "@/components/site/Section";
import { CONTACT_EMAIL } from "@/content/extension";
import { contactLinkProps } from "@/content/contact";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — OfferLyst" },
      { name: "description", content: "Get in touch with the OfferLyst team." },
      { property: "og:title", content: "Contact — OfferLyst" },
      {
        property: "og:description",
        content: "Questions, extension access, or more AI credits. Write to the OfferLyst team.",
      },
    ],
  }),
  component: Contact,
});

/**
 * Deliberately mailto-based rather than a form. The previous version rendered a
 * contact form that only flipped a local `sent` flag and told the visitor "we'll
 * be in touch" without sending anything anywhere. There is no contact endpoint
 * in the app, so these open the visitor's own mail client instead of pretending
 * to deliver a message.
 */
const reasons = [
  {
    icon: Sparkles,
    title: "More AI credits",
    body: "Run out of credits for resume matching, cover letters or interview prep? Tell us what you are working on and we will top you up.",
    subject: "More AI credits",
  },
  {
    icon: Chrome,
    title: "Chrome extension access",
    body: "The extension is in early access and not on the Chrome Web Store yet. Ask us for the build and install instructions.",
    subject: "Extension access",
  },
  {
    icon: Mail,
    title: "Anything else",
    body: "Bugs, a job site you want supported, feedback on the product, or a question before you sign up.",
    subject: "Hello",
  },
];

function Contact() {
  return (
    <Section
      eyebrow="Contact"
      title="Get in touch."
      description="OfferLyst is a small early-access product. Mail goes to the people building it."
      spacing="last"
      className="pt-24 md:pt-32"
    >
      <div className="mx-auto max-w-4xl">
        <a
          {...contactLinkProps()}
          className="card-hover flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-8 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-[#93C5FD]">
            <Mail className="h-5 w-5" />
          </span>
          <p className="mt-2 font-display text-fluid-h3 font-semibold break-all">{CONTACT_EMAIL}</p>
          <p className="text-sm text-muted-foreground">
            Opens a Gmail draft addressed to us. We read everything that comes in.
          </p>
        </a>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {reasons.map((r) => (
            <a
              key={r.title}
              {...contactLinkProps({ subject: r.subject, body: r.body })}
              className="card-hover flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#93C5FD]">
                <r.icon className="h-4 w-4" />
              </span>
              <p className="mt-4 font-medium">{r.title}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              <span className="mt-4 text-xs font-medium text-[#93C5FD]">Write to us</span>
            </a>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Looking for how something works? The{" "}
          <Link to="/faq" className="text-[#93C5FD] hover:underline">
            FAQ
          </Link>{" "}
          covers the common questions, and the{" "}
          <Link to="/extension" className="text-[#93C5FD] hover:underline">
            extension guide
          </Link>{" "}
          walks through saving your first job.
        </p>
      </div>
    </Section>
  );
}
