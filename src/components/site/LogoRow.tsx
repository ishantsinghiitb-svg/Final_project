const platforms = [
  "LinkedIn",
  "Wellfound",
  "Greenhouse",
  "Lever",
  "Ashby",
  "Naukri",
  "Company pages",
];

const trustPills = [
  { label: "Free to start", hint: "No credit card" },
  { label: "Privacy first", hint: "Never sold or shared" },
  { label: "Chrome extension", hint: "Save any job in one click" },
  { label: "Student friendly", hint: "50% off with a .edu address" },
  { label: "Encrypted storage", hint: "AES-256 at rest, TLS 1.3 in transit" },
  { label: "Built for modern job seekers", hint: "Not your parents' job board" },
];

export function LogoRow() {
  return (
    <div className="mx-auto mt-14 max-w-5xl px-6">
      <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Works with the platforms you already use
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {platforms.map((l) => (
          <span
            key={l}
            className="font-display text-sm font-medium text-muted-foreground/70 transition-colors hover:text-muted-foreground"
          >
            {l}
          </span>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        {trustPills.map((p) => (
          <div
            key={p.label}
            className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[oklch(0.58_0.21_260)]/15 text-[#93C5FD]">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{p.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">{p.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
