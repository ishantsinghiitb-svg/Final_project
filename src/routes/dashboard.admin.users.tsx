import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Search, User as UserIcon } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import { useAdminUsers } from "@/features/admin/hooks";

export const Route = createFileRoute("/dashboard/admin/users")({
  component: AdminUsersPage,
});

// ── Admin user search (Module 13 · Phase 5) ──
//
// Read-only by design — see src/server/admin/AdminUsers.ts's header comment
// for why there is no disable/delete action here.

function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(value), 300);
  }, []);

  const { data: users, isLoading, isError } = useAdminUsers(debounced);

  return (
    <div className="space-y-3">
      <DashCard padded={false} className="p-3">
        <div className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
          <input
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full bg-transparent text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:outline-none"
          />
        </div>
      </DashCard>

      <DashCard>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
          </div>
        ) : isError ? (
          <p className="py-4 text-sm text-rose-600">Failed to load users. Try again.</p>
        ) : !users || users.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <UserIcon className="h-6 w-6 text-[oklch(0.6_0.02_265)]" />
            <p className="text-sm text-[oklch(0.5_0.02_265)]">
              {debounced ? "No users match that search." : "No users found."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-[oklch(0.5_0.02_265)]">
                  <th className="py-2 pr-3 font-medium">User</th>
                  <th className="py-2 pr-3 font-medium">Location</th>
                  <th className="py-2 pr-3 font-medium">Target role</th>
                  <th className="py-2 pr-3 font-medium">AI credits</th>
                  <th className="py-2 pr-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-[oklch(0.2_0.02_265)]">
                        {u.fullName || "Unnamed user"}
                      </p>
                      <p className="text-xs text-[oklch(0.5_0.02_265)]">{u.email ?? "—"}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-[oklch(0.4_0.02_265)]">{u.location || "—"}</td>
                    <td className="py-2.5 pr-3 text-[oklch(0.4_0.02_265)]">{u.targetRole || "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-[oklch(0.4_0.02_265)]">
                      {u.creditsUsed !== null && u.creditsTotal !== null
                        ? `${u.creditsUsed}/${u.creditsTotal} used`
                        : "No usage yet"}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-[oklch(0.5_0.02_265)]">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>
    </div>
  );
}
