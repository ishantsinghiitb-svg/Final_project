import { SUPPORTED_PLATFORMS } from "@/content/extension";

const trustPills = [
  { label: "Free to start", hint: "No credit card" },
  { label: "Privacy first", hint: "Your data is never sold or shared" },
  { label: "Chrome extension", hint: "Save any job in one click" },
  { label: "AI credits included", hint: "Every account starts with a free allowance" },
  { label: "Your documents stay yours", hint: "Resumes are private to your account" },
  { label: "Built for the Indian job search", hint: "Naukri, Internshala and Unstop included" },
];

export function LogoRow() {
  return (
    <div className="site-container mt-14">
      <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
        The Chrome extension works on
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {SUPPORTED_PLATFORMS.map((p) => (
          <span
            key={p.name}
            className="font-display text-sm font-medium text-muted-foreground/70 transition-colors hover:text-muted-foreground"
          >
            {p.name}
          </span>
        ))}
      </div>

      <div className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {trustPills.map((p) => (
          <div
            key={p.label}
            className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[oklch(0.58_0.21_260)]/15 text-[#93C5FD]">
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{p.label}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">{p.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
