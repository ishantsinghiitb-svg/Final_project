export function LogoRow() {
  const logos = ["LinkedIn", "Wellfound", "Greenhouse", "Lever", "Naukri", "Careers"];
  return (
    <div className="mx-auto mt-6 max-w-5xl px-6">
      <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Works with the platforms you already use
      </p>
      <div className="mt-5 grid grid-cols-3 items-center gap-4 md:grid-cols-6">
        {logos.map((l) => (
          <div
            key={l}
            className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-center font-display text-sm font-medium text-muted-foreground/80"
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}