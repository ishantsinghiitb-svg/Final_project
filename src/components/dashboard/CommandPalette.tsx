import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bookmark,
  Briefcase,
  CalendarClock,
  FileText,
  LineChart,
  Plus,
  Search,
  Settings,
  Sparkles,
  StickyNote,
  Target,
  ArrowRight,
} from "lucide-react";
import { jobs } from "@/lib/dashboard-data";
import { Kbd } from "./primitives";

type Command = {
  id: string;
  label: string;
  hint?: string;
  section: "Navigate" | "Actions" | "Jobs";
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate({ to });
    };
    const nav: Command[] = [
      { id: "n-overview", label: "Go to Overview", section: "Navigate", icon: Activity, run: go("/dashboard") },
      { id: "n-jobs", label: "Go to Jobs", section: "Navigate", icon: Briefcase, run: go("/dashboard/jobs") },
      { id: "n-saved", label: "Go to Saved", section: "Navigate", icon: Bookmark, run: go("/dashboard/saved") },
      { id: "n-apps", label: "Go to Applications", section: "Navigate", icon: Target, run: go("/dashboard/applications") },
      { id: "n-resumes", label: "Go to Resumes", section: "Navigate", icon: FileText, run: go("/dashboard/resumes") },
      { id: "n-int", label: "Go to Interviews", section: "Navigate", icon: CalendarClock, run: go("/dashboard/interviews") },
      { id: "n-notes", label: "Go to Notes", section: "Navigate", icon: StickyNote, run: go("/dashboard/notes") },
      { id: "n-analytics", label: "Go to Analytics", section: "Navigate", icon: LineChart, run: go("/dashboard/analytics") },
      { id: "n-settings", label: "Go to Settings", section: "Navigate", icon: Settings, run: go("/dashboard/settings") },
    ];
    const actions: Command[] = [
      { id: "a-add", label: "Add a job manually", hint: "Track a role from anywhere", section: "Actions", icon: Plus, run: go("/dashboard/jobs") },
      { id: "a-tailor", label: "Tailor resume with AI", section: "Actions", icon: Sparkles, run: go("/dashboard/resumes") },
      { id: "a-cover", label: "Generate cover letter", section: "Actions", icon: FileText, run: go("/dashboard/resumes") },
      { id: "a-prep", label: "Prep for upcoming interview", section: "Actions", icon: CalendarClock, run: go("/dashboard/interviews") },
    ];
    const jobCommands: Command[] = jobs.slice(0, 8).map((j) => ({
      id: `j-${j.id}`,
      label: `${j.company} — ${j.role}`,
      hint: j.location,
      section: "Jobs",
      icon: Briefcase,
      run: go("/dashboard/jobs"),
    }));
    return [...nav, ...actions, ...jobCommands];
  }, [navigate, onClose]);

  const filtered = q
    ? commands.filter((c) => (c.label + " " + (c.hint ?? "")).toLowerCase().includes(q.toLowerCase()))
    : commands;

  const grouped = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.section] ??= []).push(c);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
          <Search className="h-4 w-4 text-[oklch(0.5_0.02_265)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs, pages, actions…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[oklch(0.55_0.02_265)]"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {Object.keys(grouped).length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[oklch(0.5_0.02_265)]">
              No results for "{q}".
            </p>
          )}
          {(["Navigate", "Actions", "Jobs"] as const).map((section) => {
            const items = grouped[section];
            if (!items?.length) return null;
            return (
              <div key={section} className="py-1">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">
                  {section}
                </p>
                {items.map((c) => (
                  <button
                    key={c.id}
                    onClick={c.run}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[oklch(0.97_0.01_265)]"
                  >
                    <c.icon className="h-4 w-4 text-[oklch(0.45_0.02_265)]" />
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && (
                      <span className="truncate text-xs text-[oklch(0.55_0.02_265)]">{c.hint}</span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-black/5 bg-[oklch(0.98_0.005_265)] px-4 py-2 text-[11px] text-[oklch(0.5_0.02_265)]">
          <span className="flex items-center gap-2">
            <Kbd>↑</Kbd><Kbd>↓</Kbd> to navigate
          </span>
          <span className="flex items-center gap-2">
            <Kbd>⌘</Kbd><Kbd>K</Kbd> to toggle
          </span>
        </div>
      </div>
    </div>
  );
}