/**
 * Deep-links straight to a specific message in the Gmail web UI —
 * `https://mail.google.com/mail/?authuser={email}#all/{gmailMessageId}`.
 * No backend call: built entirely from data already on hand (the connected
 * account's address + Gmail's own external message id). `authuser` pins the
 * link to the right account when the viewer is signed into more than one.
 */
export function gmailDeepLink(googleEmail: string, externalMessageId: string): string {
  const params = new URLSearchParams({ authuser: googleEmail });
  return `https://mail.google.com/mail/?${params.toString()}#all/${externalMessageId}`;
}

/**
 * Opens the message in Gmail with the reply composer already focused.
 *
 * NextOffer holds only the `gmail.readonly` scope and is therefore incapable
 * of sending mail — replying happens in Gmail itself, and this link is what
 * makes that one click instead of a search. Gmail's `?compose=` fragment
 * parameter opens the reply box on the thread being viewed; if Gmail ignores
 * it in some client state the user still lands on the right thread, so the
 * link degrades to the same behaviour as {@link gmailDeepLink} rather than
 * failing.
 */
export function gmailReplyLink(googleEmail: string, externalMessageId: string): string {
  const params = new URLSearchParams({ authuser: googleEmail });
  return `https://mail.google.com/mail/?${params.toString()}#all/${externalMessageId}?compose=new`;
}
