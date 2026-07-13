// ── Date ──
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

export function isToday(date: string | Date): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toDateString() === new Date().toDateString();
}

export function isTomorrow(date: string | Date): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.toDateString() === tomorrow.toDateString();
}

// ── Salary ──
export function formatSalary(
  min?: number,
  max?: number,
  currency = "USD",
): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  if (min && max) return `${symbol}${min}–${symbol}${max}k`;
  if (min) return `${symbol}${min}k+`;
  if (max) return `up to ${symbol}${max}k`;
  return "—";
}

// ── Experience ──
export function yearsToLevel(years: number): string {
  if (years < 1) return "entry";
  if (years < 3) return "junior";
  if (years < 5) return "mid";
  if (years < 8) return "senior";
  if (years < 12) return "lead";
  if (years < 15) return "staff";
  return "principal";
}

// ── Location ──
export function formatLocation(city?: string, state?: string, remote?: boolean): string {
  if (remote) return "Remote";
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  return "—";
}

// ── Company ──
export function companyInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ── Avatar ──
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

export function displayName(name: string | null, email: string | null): string {
  if (name) return name;
  if (email) return email.split("@")[0].replace(/[._-]/g, " ");
  return "Account";
}

// ── Files ──
export function fileExtension(filename: string): string {
  return filename.split(".").pop() ?? "";
}

export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

// ── Strings ──
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleCase(str: string): string {
  return str.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

// ── Errors ──
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred.";
}

export function isNetworkError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return msg.includes("network") || msg.includes("fetch");
}

// ── Formatting ──
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatPercent(n: number): string {
  return `${Math.round(n)}%`;
}
