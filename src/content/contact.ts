/** Public contact address. The one address the product hands out. */
export const CONTACT_EMAIL = "offerlyst@gmail.com";

/**
 * One builder for every "write to us" action in the product.
 *
 * The site previously used `mailto:` everywhere. That is correct markup, but on
 * a machine with no desktop mail client registered — the common case in Chrome
 * on Windows — clicking it appears to do nothing at all, which is exactly how
 * the Contact page's "Write to us" was reported. Gmail's web compose URL opens
 * a real, editable draft in a new tab instead, and Google shows its normal sign
 * in screen first when the visitor isn't logged in, so the unauthenticated case
 * degrades gracefully rather than silently failing.
 *
 * The recipient, subject and body are all prefilled and all still editable by
 * the sender before anything is sent. Nothing is sent on the user's behalf, and
 * this needs no Gmail scopes: it is an ordinary link, entirely independent of
 * the Google integration in Settings.
 */

const GMAIL_COMPOSE = "https://mail.google.com/mail/?view=cm&fs=1";

export type ContactRequest = {
  /** Appended after "OfferLyst: " in the subject line. */
  subject?: string;
  /** Optional starter text. The sender can edit or delete it. */
  body?: string;
  /** Recipient override. Defaults to the public OfferLyst address. */
  to?: string;
};

/** Gmail web compose URL with the recipient, subject and body prefilled. */
export function contactHref({ subject, body, to = CONTACT_EMAIL }: ContactRequest = {}): string {
  const params = new URLSearchParams({ to });
  if (subject) params.set("su", `OfferLyst: ${subject}`);
  if (body) params.set("body", body);
  return `${GMAIL_COMPOSE}&${params.toString()}`;
}

/**
 * Props to spread onto an anchor so every contact CTA opens the same way.
 * `noopener` matters because this opens a Google-hosted page in a new tab.
 */
export function contactLinkProps(request: ContactRequest = {}) {
  return {
    href: contactHref(request),
    target: "_blank",
    rel: "noopener noreferrer",
  } as const;
}

/** Prefilled body for the "I need more AI credits" flow. */
export function creditsRequestBody(context?: string): string {
  return context
    ? `Hi OfferLyst team,\n\nI ran out of AI credits while using ${context}.\n\nWhat I'm working on:\n\nThanks!`
    : `Hi OfferLyst team,\n\nI'd like more AI credits.\n\nWhat I'm working on:\n\nThanks!`;
}
