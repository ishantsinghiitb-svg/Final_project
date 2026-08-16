import { useCallback, useRef, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  DashCard,
  PageHeader,
  SectionTitle,
  Chip,
  StickyPageHeader,
} from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { GoogleConnectionCard } from "@/components/dashboard/settings/GoogleConnectionCard";
import { JobCrawlersCard } from "@/components/dashboard/settings/JobCrawlersCard";
import { useCrawlAdminOverview } from "@/features/jobCrawlers/hooks";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useAICredits } from "@/features/ai/hooks";
import { NeedMoreCreditsLink } from "@/components/dashboard/ai/NeedMoreCredits";
import { CREDIT_COSTS, CREDITS_CTA_TITLE } from "@/content/credits";
import { UserAvatar } from "@/components/dashboard/UserAvatar";
import { useUserIdentity } from "@/features/profile/identity";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [{ title: "Settings — OfferLyst" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

const tabs = ["Profile", "Notifications", "Integrations", "Credits"] as const;

/** Module 10B.1: an operator-only tab, appended for admins only. */
const ADMIN_TAB = "Job crawlers";

type SettingsTab = (typeof tabs)[number] | typeof ADMIN_TAB;

function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("Profile");

  // The server decides admin-ness (`isAdmin`); this only decides whether to
  // draw the tab. The server functions behind it re-check on every call, so a
  // user who forces the tab open still gets nothing.
  const crawlOverview = useCrawlAdminOverview();
  const isAdmin = crawlOverview.data?.isAdmin === true;
  const visibleTabs: SettingsTab[] = isAdmin ? [...tabs, ADMIN_TAB] : [...tabs];

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Settings"
          title="Make OfferLyst yours."
          subtitle="Tune preferences, notifications, and integrations."
        />
      </StickyPageHeader>

      {/* Scrolls horizontally rather than wrapping onto a second row on
          narrow screens, and the taller hit area keeps the tabs comfortable
          to tap. */}
      <div className="-mx-1 overflow-x-auto px-1 scrollbar-hide">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="inline-flex min-w-full gap-1 rounded-xl border border-black/5 bg-white p-1"
        >
          {visibleTabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs transition-colors ${
                tab === t
                  ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                  : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "Profile" && <ProfileTab />}
      {tab === "Notifications" && <NotificationsTab />}
      {tab === "Integrations" && <IntegrationsTab />}
      {tab === "Credits" && <CreditsTab />}
      {tab === ADMIN_TAB && isAdmin && <JobCrawlersCard overview={crawlOverview} />}
    </>
  );
}

function ProfileTab() {
  const {
    profile,
    loading: profileLoading,
    update: updateProfileData,
    uploadAvatar: uploadProfileAvatar,
  } = useProfile();
  const { avatarUrl, initials, email } = useUserIdentity();
  const [fullName, setFullName] = useState("");
  const [location, setLocation] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setFullName(profile?.full_name ?? "");
    setLocation(profile?.location ?? "");
    setTargetRole(profile?.target_role ?? "");
  }, [profile]);

  useEffect(() => {
    if (profile) resetForm();
  }, [profile, resetForm]);

  const isDirty =
    fullName !== (profile?.full_name ?? "") ||
    location !== (profile?.location ?? "") ||
    targetRole !== (profile?.target_role ?? "");

  async function handleSave() {
    if (!fullName.trim()) {
      toast.error("Full name is required.");
      return;
    }
    setSaving(true);
    const { error } = await updateProfileData({
      full_name: fullName.trim(),
      location: location.trim() || null,
      target_role: targetRole.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Profile saved.");
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    const { url, error } = await uploadProfileAvatar(file);
    setUploading(false);
    if (error) {
      toast.error(error);
    } else if (url) {
      toast.success("Profile photo updated.");
    }
    e.target.value = "";
  }

  if (profileLoading && !profile) {
    return (
      <DashCard>
        <SectionTitle>Profile</SectionTitle>
        <p className="mt-4 text-sm text-[oklch(0.5_0.02_265)]">Loading…</p>
      </DashCard>
    );
  }

  return (
    <DashCard>
      <SectionTitle>Profile</SectionTitle>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label="Change profile photo"
        >
          {/* Same resolver the sidebar uses, so an avatar supplied by Google
              shows here too even when the profile row has none stored. */}
          <UserAvatar avatarUrl={avatarUrl} initials={initials} size={64} />
          {uploading && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </span>
          )}
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-[oklch(0.5_0.02_265)]">
            {avatarUrl && !profile?.avatar_url
              ? "Using the photo from your Google account. Upload one to override it."
              : "Click the photo to upload. PNG or JPG, up to 5 MB."}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleAvatarChange}
          className="hidden"
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-xs font-medium text-[oklch(0.45_0.02_265)]">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/5 bg-white px-3 py-2 outline-none focus:border-[#2563EB]/30 focus:ring-2 focus:ring-[#2563EB]/10"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-[oklch(0.45_0.02_265)]">Email</span>
          <input
            value={email}
            readOnly
            aria-label="Account email"
            className="mt-1 w-full cursor-not-allowed rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2 text-sm text-[oklch(0.5_0.02_265)] outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-[oklch(0.45_0.02_265)]">Location</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/5 bg-white px-3 py-2 outline-none focus:border-[#2563EB]/30 focus:ring-2 focus:ring-[#2563EB]/10"
            placeholder="San Francisco, CA"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-[oklch(0.45_0.02_265)]">Target role</span>
          <input
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/5 bg-white px-3 py-2 outline-none focus:border-[#2563EB]/30 focus:ring-2 focus:ring-[#2563EB]/10"
            placeholder="Senior Product Designer"
          />
        </label>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-black/5 pt-4 sm:flex-row sm:justify-end">
        {/* Previously a no-op button. It now discards edits by restoring the
            values currently stored on the profile. */}
        <button
          type="button"
          onClick={resetForm}
          disabled={saving || !isDirty}
          className="rounded-lg border border-black/5 bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-black/[0.03] disabled:opacity-40"
        >
          Cancel
        </button>
        <DashButton onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Saving…
            </span>
          ) : (
            "Save changes"
          )}
        </DashButton>
      </div>
    </DashCard>
  );
}

function NotificationsTab() {
  return (
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
  );
}

/**
 * Google is the only integration that actually connects to anything, so it is
 * the only one with a live status. The previous version of this tab listed
 * LinkedIn as "Connected" and offered Slack and Notion cards with Connect
 * buttons, none of which exist.
 */
function IntegrationsTab() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <GoogleConnectionCard />
      <DashCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display font-semibold">Chrome extension</p>
            <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
              Save jobs from supported sites in one click. It signs in with the session already in
              this browser, so there is nothing to connect here.
            </p>
          </div>
          <Chip tone="default">Early access</Chip>
        </div>
        <a
          href="/extension"
          className="mt-4 inline-block rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03]"
        >
          How it works
        </a>
      </DashCard>
    </div>
  );
}

/**
 * Replaces the old "Billing" tab, which showed a hardcoded "Pro trial · 9 days
 * left" and two buttons that did nothing. There are no paid plans, so this
 * shows the user's real credit balance from `useAICredits` and the same
 * contact route every other out-of-credits surface uses.
 */
function CreditsTab() {
  const { data: credits, isLoading } = useAICredits();

  const used = credits?.creditsUsed ?? 0;
  const total = credits?.creditsTotal ?? 0;
  const remaining = credits?.creditsRemaining ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <div className="space-y-4">
      <DashCard>
        <SectionTitle>AI credits</SectionTitle>
        {isLoading ? (
          <p className="mt-4 text-sm text-[oklch(0.5_0.02_265)]">Loading your balance…</p>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-black/5 bg-gradient-to-br from-[#2563EB]/[0.05] to-[#7C3AED]/[0.08] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-2xl font-semibold tabular-nums">
                  {remaining}
                  <span className="ml-1 text-sm font-normal text-[oklch(0.5_0.02_265)]">
                    of {total} left
                  </span>
                </p>
                {remaining <= 0 && <Chip tone="amber">All used</Chip>}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[oklch(0.5_0.02_265)]">
                {used} used so far. Saving jobs, tracking applications, notes and analytics never
                use credits.
              </p>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium">{CREDITS_CTA_TITLE}</p>
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_265)]">
                There are no paid plans right now. Tell us what you are working on and we will top
                up your allowance.
              </p>
              <NeedMoreCreditsLink variant="primary" className="mt-3" context="the settings page">
                Contact us
              </NeedMoreCreditsLink>
            </div>
          </>
        )}
      </DashCard>

      <DashCard>
        <SectionTitle>What each action costs</SectionTitle>
        <ul className="mt-3 divide-y divide-black/5 text-sm">
          {CREDIT_COSTS.map((c) => (
            <li key={c.label} className="flex items-center justify-between py-2.5">
              <span className="text-[oklch(0.35_0.02_265)]">{c.label}</span>
              <span className="tabular-nums text-[oklch(0.5_0.02_265)]">
                {c.cost} {c.cost === 1 ? "credit" : "credits"}
              </span>
            </li>
          ))}
        </ul>
      </DashCard>
    </div>
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
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}
