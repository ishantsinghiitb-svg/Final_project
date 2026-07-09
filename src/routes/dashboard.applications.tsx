import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid, List, Plus } from "lucide-react";
import { useState } from "react";
import { DashCard, PageHeader, Chip, CompanyMark } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { jobs, stageMeta, type PipelineStage } from "@/lib/dashboard-data";

export const Route = createFileRoute("/dashboard/applications")({
  head: () => ({ meta: [{ title: "Applications — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: AppsPage,
});

const stages: PipelineStage[] = ["interested", "applied", "interview", "offer", "rejected"];

function AppsPage() {
  const [view, setView] = useState<"board" | "list">("board");
  const applied = jobs.filter((j) => j.stage);

  return (
    <>
      <PageHeader
        eyebrow="Applications"
        title="Track every step, without losing the thread."
        subtitle="Drag roles between stages to keep your pipeline honest. NextOffer nudges you when something's gone quiet."
        actions={
          <>
            <div className="inline-flex rounded-lg border border-black/5 bg-white p-0.5 text-xs">
              {(["board", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 ${
                    view === v ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]" : "text-[oklch(0.5_0.02_265)]"
                  }`}
                >
                  {v === "board" ? <LayoutGrid className="h-3 w-3" /> : <List className="h-3 w-3" />}
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <DashButton>
              <Plus className="h-4 w-4" /> Log an application
            </DashButton>
          </>
        }
      />

      {view === "board" ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {stages.map((stage) => {
            const list = jobs.filter((j) => j.stage === stage);
            const meta = stageMeta[stage];
            return (
              <div key={stage} className="rounded-2xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3">
                <div className="flex items-center justify-between px-1 pb-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-[oklch(0.55_0.02_265)]">{list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.map((j) => (
                    <div key={j.id} className="rounded-xl border border-black/5 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <CompanyMark company={j.company} tone={j.logoTone} size={26} />
                        <p className="truncate text-sm font-semibold">{j.company}</p>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs text-[oklch(0.5_0.02_265)]">{j.role}</p>
                      {j.nextStep && (
                        <p className="mt-2 rounded-md bg-[oklch(0.97_0.01_265)] px-2 py-1 text-[11px]">
                          {j.nextStep}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between text-[10px] text-[oklch(0.55_0.02_265)]">
                        <span>{j.appliedAt ?? "Not applied"}</span>
                        <Chip tone="default">{j.match}%</Chip>
                      </div>
                    </div>
                  ))}
                  {list.length === 0 && (
                    <p className="rounded-lg border border-dashed border-black/10 bg-white/50 px-3 py-4 text-center text-[11px] text-[oklch(0.55_0.02_265)]">
                      No roles here yet
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DashCard padded={false}>
          <table className="w-full text-sm">
            <thead className="border-b border-black/5 text-left text-[11px] uppercase tracking-wider text-[oklch(0.55_0.02_265)]">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Applied</th>
                <th className="px-4 py-3 font-medium">Next step</th>
                <th className="px-4 py-3 font-medium">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {applied.map((j) => {
                const meta = j.stage ? stageMeta[j.stage] : null;
                return (
                  <tr key={j.id} className="hover:bg-[oklch(0.98_0.005_265)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CompanyMark company={j.company} tone={j.logoTone} size={22} />
                        <span className="font-medium">{j.company}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[oklch(0.4_0.02_265)]">{j.role}</td>
                    <td className="px-4 py-3">
                      {meta && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[oklch(0.5_0.02_265)]">{j.appliedAt}</td>
                    <td className="px-4 py-3 text-xs">{j.nextStep}</td>
                    <td className="px-4 py-3 text-xs font-medium">{j.match}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DashCard>
      )}
    </>
  );
}