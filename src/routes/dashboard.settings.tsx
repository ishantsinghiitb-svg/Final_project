import { useRef, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { DashCard, PageHeader, SectionTitle, Chip, StickyPageHeader } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

const tabs = ["Profile", "Notifications", "Integrations", "Billing"] as const;

function SettingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Profile");

  return (
    <>
      <StickyPageHeader>
      <PageHeader eyebrow="Settings" title="Make NextOffer yours." subtitle="Tune preferences, notifications, and integrations." />
      </StickyPageHeader>

      <div className="flex flex-wrap gap-1 rounded-xl border border-black/5 bg-white p-0.5">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              tab === t ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]" : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Profile" && <ProfileTab />}
      {tab === "Notifications" && <NotificationsTab />}
      {tab === "Integrations" && <IntegrationsTab />}
      {tab === "Billing" && <BillingTab />}
    </>
  );
}

function ProfileTab() {
  const { profile, loading: profileLoading, update: updateProfileData, uploadAvatar: uploadProfileAvatar } = useProfile();
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [location, setLocation] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setLocation(profile.location ?? "");
      setTargetRole(profile.target_role ?? "");
    }
  }, [profile]);

  const initials = (fullName || user?.email?.split("@")[0] || "U").slice(0, 2).toUpperCase();

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

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-lg font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label="Change profile photo"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
          {uploading && (
            <span className="absolute inset-0 grid place-items-center bg-black/40">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </span>
          )}
        </button>
        <div>
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-[oklch(0.5_0.02_265)]">Click to upload. PNG, JPG up to 5 MB.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={handleAvatarChange} className="hidden" />
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
            value={profile?.email ?? user?.email ?? ""}
            readOnly
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
      <div className="mt-4 flex justify-end gap-2">
        <button className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs">Cancel</button>
        <DashButton onClick={handleSave} disabled={saving}>
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

function IntegrationsTab() {
  return (
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
  );
}

function BillingTab() {
  return (
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
