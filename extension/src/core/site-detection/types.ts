/**
 * A job board the extension knows about. `Unsupported` covers every other
 * site the content script may run on (or be injected into by mistake).
 */
export const SupportedSite = {
  LinkedIn: "linkedin",
  Internshala: "internshala",
  Naukri: "naukri",
  Indeed: "indeed",
  Unstop: "unstop",
  Unsupported: "unsupported",
} as const;

export type SupportedSite = (typeof SupportedSite)[keyof typeof SupportedSite];
