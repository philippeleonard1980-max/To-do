import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminUserActionSchema,
  adminCharacterActionSchema,
  adminReportActionSchema,
  settingsSchema,
} from "../src/lib/validation";

/**
 * These lock in the shape of what an admin may change, and — more importantly —
 * that the ordinary self-service profile endpoint cannot be used to escalate.
 * The end-to-end access checks live in the security suite; these guard the
 * schemas that back them.
 */

describe("admin action schemas", () => {
  it("accepts the supported user actions", () => {
    assert.equal(adminUserActionSchema.parse({ action: "suspend", reason: "spam" }).action, "suspend");
    assert.equal(adminUserActionSchema.parse({ action: "unsuspend" }).action, "unsuspend");
    assert.equal(adminUserActionSchema.parse({ action: "setRole", role: "admin" }).action, "setRole");
    assert.equal(adminUserActionSchema.parse({ action: "setPlan", plan: "pro" }).action, "setPlan");
  });

  it("rejects an unknown action", () => {
    assert.throws(() => adminUserActionSchema.parse({ action: "deleteEverything" }));
  });

  it("rejects a role outside the known set", () => {
    assert.throws(() => adminUserActionSchema.parse({ action: "setRole", role: "superadmin" }));
    assert.throws(() => adminUserActionSchema.parse({ action: "setRole", role: "" }));
  });

  it("rejects a plan outside the known set", () => {
    assert.throws(() => adminUserActionSchema.parse({ action: "setPlan", plan: "unlimited" }));
  });

  it("bounds the suspension reason", () => {
    // Rejected outright rather than silently truncated: a caller sending 5 KB
    // has a bug, and quietly storing a clipped reason would hide it.
    assert.throws(() => adminUserActionSchema.parse({ action: "suspend", reason: "x".repeat(5000) }));

    const ok = adminUserActionSchema.parse({ action: "suspend", reason: "spam" });
    assert.ok(ok.action === "suspend" && ok.reason === "spam");

    // Omitting it entirely is allowed and defaults to empty.
    const bare = adminUserActionSchema.parse({ action: "suspend" });
    assert.ok(bare.action === "suspend" && bare.reason === "");
  });

  it("constrains character and report actions", () => {
    assert.equal(adminCharacterActionSchema.parse({ action: "unpublish" }).action, "unpublish");
    assert.throws(() => adminCharacterActionSchema.parse({ action: "transferOwnership" }));
    assert.equal(adminReportActionSchema.parse({ status: "reviewed" }).status, "reviewed");
    assert.throws(() => adminReportActionSchema.parse({ status: "open" }));
  });
});

describe("no privilege escalation through self-service settings", () => {
  it("strips role, credits and plan from a profile update", () => {
    const parsed = settingsSchema.parse({
      displayName: "Someone",
      role: "admin",
      credits: 999999,
      plan: "pro",
      suspended: false,
    } as Record<string, unknown>);

    // Zod drops unknown keys, so these never reach the update call. The route
    // additionally writes an explicit column allowlist.
    assert.equal("role" in parsed, false);
    assert.equal("credits" in parsed, false);
    assert.equal("plan" in parsed, false);
    assert.equal("suspended" in parsed, false);
    assert.equal(parsed.displayName, "Someone");
  });

  it("ignores unknown keys nested in the settings object", () => {
    const parsed = settingsSchema.parse({
      settings: { theme: "light", role: "admin", isAdmin: true },
    } as Record<string, unknown>);
    assert.equal(parsed.settings?.theme, "light");
    assert.equal("role" in (parsed.settings ?? {}), false);
    assert.equal("isAdmin" in (parsed.settings ?? {}), false);
  });
});
