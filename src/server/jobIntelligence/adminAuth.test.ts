import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();

vi.mock("@/server/supabase", () => ({
  requireUser: (...args: unknown[]) => requireUserMock(...args),
}));

vi.mock("@/server/env", () => ({
  serverEnv: { adminEmails: "" },
}));

import { AdminAccessError, requireAdmin } from "./adminAuth";
import { serverEnv } from "@/server/env";

// The real serverEnv is `as const` (readonly). This test's vi.mock above
// substitutes a plain mutable object at runtime, but the imported binding's
// static type still comes from the real module — cast once here so each
// test can just assign.
const env = serverEnv as { adminEmails: string };

function authedAs(email: string | null) {
  requireUserMock.mockResolvedValue({
    supabase: {} as never,
    user: { id: "u1", email },
    accessToken: "token",
  });
}

describe("requireAdmin", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    env.adminEmails = "";
  });

  it("rejects when no admin emails are configured, even for a valid session", async () => {
    authedAs("someone@example.com");
    await expect(requireAdmin("token")).rejects.toThrow(AdminAccessError);
  });

  it("rejects an ordinary authenticated user not on the allowlist", async () => {
    env.adminEmails = "admin@example.com";
    authedAs("someone@example.com");
    await expect(requireAdmin("token")).rejects.toThrow(AdminAccessError);
  });

  it("allows a user whose email is on the allowlist", async () => {
    env.adminEmails = "admin@example.com";
    authedAs("admin@example.com");
    await expect(requireAdmin("token")).resolves.toMatchObject({
      user: { email: "admin@example.com" },
    });
  });

  it("is case-insensitive and tolerates whitespace in the allowlist", async () => {
    env.adminEmails = " Admin@Example.com , second@example.com ";
    authedAs("admin@example.com");
    await expect(requireAdmin("token")).resolves.toBeTruthy();
  });

  it("rejects a session with no verified email", async () => {
    env.adminEmails = "admin@example.com";
    authedAs(null);
    await expect(requireAdmin("token")).rejects.toThrow(AdminAccessError);
  });

  it("propagates requireUser's own rejection for an invalid session", async () => {
    env.adminEmails = "admin@example.com";
    requireUserMock.mockRejectedValue(new Error("Not authenticated: invalid session"));
    await expect(requireAdmin("bad-token")).rejects.toThrow("Not authenticated");
  });
});
