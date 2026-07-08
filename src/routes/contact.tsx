import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, MessageCircle, MapPin } from "lucide-react";
import { Section } from "@/components/site/Section";
import { Button } from "@/components/site/PrimaryButton";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — NextOffer" },
      { name: "description", content: "Get in touch with the NextOffer team." },
      { property: "og:title", content: "Contact — NextOffer" },
      { property: "og:description", content: "Reach the NextOffer team for sales, support, or partnerships." },
    ],
  }),
  component: Contact,
});

function Contact() {
  const [sent, setSent] = useState(false);
  return (
    <Section eyebrow="Contact" title="Say hello." description="A real human on the team replies within one business day." className="pb-32">
      <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          {[
            { i: Mail, t: "hello@nextoffer.io", d: "General & support" },
            { i: MessageCircle, t: "sales@nextoffer.io", d: "Teams & partnerships" },
            { i: MapPin, t: "Remote — SF · Berlin · Bengaluru", d: "Distributed since day one" },
          ].map((r) => (
            <div key={r.t} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <div className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#93C5FD]">
                <r.i className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">{r.t}</p>
                <p className="text-sm text-muted-foreground">{r.d}</p>
              </div>
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          className="rounded-2xl border border-white/8 bg-white/[0.02] p-6"
        >
          {sent ? (
            <div className="grid min-h-[280px] place-items-center text-center">
              <div>
                <div className="mx-auto h-12 w-12 rounded-full bg-gradient-to-br from-[#22C55E] to-[#2563EB]" />
                <p className="mt-4 font-display text-xl font-semibold">Thanks — we'll be in touch.</p>
                <p className="mt-2 text-sm text-muted-foreground">Expect a reply within one business day.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name" placeholder="Ada Lovelace" required />
                <Field label="Email" type="email" placeholder="you@company.com" required />
              </div>
              <div className="mt-4">
                <Field label="Subject" placeholder="What's this about?" />
              </div>
              <div className="mt-4">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Message</label>
                <textarea
                  required
                  rows={5}
                  placeholder="Tell us a bit…"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-white/25 focus:bg-white/[0.04]"
                />
              </div>
              <div className="mt-5 flex items-center justify-end gap-3">
                <Button type="submit">Send message</Button>
              </div>
            </>
          )}
        </form>
      </div>
    </Section>
  );
}

function Field({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        {...rest}
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-white/25 focus:bg-white/[0.04]"
      />
    </label>
  );
}