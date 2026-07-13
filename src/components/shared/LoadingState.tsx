type Props = { label?: string; className?: string };

export function LoadingState({ label = "Loading…", className = "" }: Props) {
  return (
    <div className={`flex items-center justify-center gap-2 py-8 ${className}`}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/10 border-t-[#2563EB]" />
      <span className="text-sm text-[oklch(0.5_0.02_265)]">{label}</span>
    </div>
  );
}

export function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
    </div>
  );
}
