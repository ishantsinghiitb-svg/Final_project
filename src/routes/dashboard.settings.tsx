import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DashCard, PageHeader, SectionTitle, Chip } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

const tabs = ["Profile", "Notifications", "Integrations", "Billing"] as const;

function SettingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Profile");

  return (
    <>
      <PageHeader eyebrow="Settings" title="Make NextOffer yours." subtitle="Tune preferences, notifications, and integrations." />

      <div className="flex flex-wrap gap-1 rounded-xl border border-black/5 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === t ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]" : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Profile" && (
        <DashCard>
          <SectionTitle>Profile</SectionTitle>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              { l: "Full name", v: "Ava Chen" },
              { l: "Email", v: "ava@nextoffer.app" },
              { l: "Location", v: "San Francisco, CA" },
              { l: "Target role", v: "Senior Product Designer" },
            ].map((f) => (
              <label key={f.l} className="block text-sm">
                <span className="text-xs font-medium text-[oklch(0.45_0.02_265)]">{f.l}</span>
                <input defaultValue={f.v} className="mt-1 w-full rounded-lg border border-black/5 bg-white px-3 py-2 outline-none focus:border-[#2563EB]/30 focus:ring-2 focus:ring-[#2563EB]/10" />
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-sm">Cancel</button>
            <DashButton>Save changes</DashButton>
          </div>
        </DashCard>
      )}

      {tab === "Notifications" && (
        <DashCard>
          <SectionTitle>Notifications</SectionTitle>
          <ul className="mt-3 divide-y divide-black/5">
            {[
              { l: "New matches above 85%", d: "Daily digest at 9:00 AM local time", on: true },
              { l: "Interview reminders", d: "1 hour and 15 minutes before", on: true },
              { l: "Follow-up nudges", d: "After 5 days of silence", on: true },
              { l: "Weekly recap", d: "Every Sunday evening", on: false },
            ].map((n) => (
              <li key={n.l} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{n.l}</p>
                  <p className="text-xs text-[oklch(0.5_0.02_265)]">{n.d}</p>
                </div>
                <Toggle defaultOn={n.on} />
              </li>
            ))}
          </ul>
        </DashCard>
      )}

      {tab === "Integrations" && (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { l: "Chrome extension", d: "Save jobs from any site with one click", status: "Connected" },
            { l: "LinkedIn", d: "Auto-import jobs you view", status: "Connected" },
            { l: "Google Calendar", d: "Sync interviews to your calendar", status: "Not connected" },
            { l: "Gmail", d: "Detect recruiter emails automatically", status: "Not connected" },
            { l: "Slack", d: "Get nudges in your DMs", status: "Not connected" },
            { l: "Notion", d: "Export applications to a database", status: "Not connected" },
          ].map((i) => (
            <DashCard key={i.l}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-semibold">{i.l}</p>
                  <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">{i.d}</p>
                </div>
                <Chip tone={i.status === "Connected" ? "green" : "default"}>{i.status}</Chip>
              </div>
              <button className="mt-4 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03]">
                {i.status === "Connected" ? "Manage" : "Connect"}
              </button>
            </DashCard>
          ))}
        </div>
      )}

      {tab === "Billing" && (
        <DashCard>
          <SectionTitle>Billing</SectionTitle>
          <div className="mt-4 rounded-xl border border-black/5 bg-gradient-to-br from-[#2563EB]/[0.05] to-[#7C3AED]/[0.08] p-4">
            <p className="font-display font-semibold">Pro trial · 9 days left</p>
            <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">Unlimited AI, cover letters, and analytics.</p>
            <div className="mt-3 flex gap-2">
              <DashButton size="sm">Upgrade to Pro</DashButton>
              <button className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium">Manage plan</button>
            </div>
          </div>
          <div className="mt-4 text-sm text-[oklch(0.45_0.02_265)]">
            No card on file. You won't be charged until you upgrade.
          </div>
        </DashCard>
      )}
    </>
  );
}

function Toggle({ defaultOn }: { defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(!on)}
      className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" : "bg-black/10"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}