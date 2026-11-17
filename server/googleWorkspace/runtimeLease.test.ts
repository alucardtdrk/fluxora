import { afterEach, expect, it, vi } from "vitest";
import { withFirestoreLease } from "../firestore.js";
import { syncGoogleWorkspaceSecurity, continueGoogleWorkspaceSecurityBackfill, syncCurrentGoogleWorkspaceSecurity, syncDailyGoogleWorkspaceSecurity } from "./runtime.js";
vi.mock("../firestore.js", async original => ({ ...await original<typeof import("../firestore.js")>(), withFirestoreLease: vi.fn(async () => { throw new Error("OPERATION_BUSY"); }) }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
it.each([syncGoogleWorkspaceSecurity, continueGoogleWorkspaceSecurityBackfill, syncCurrentGoogleWorkspaceSecurity])("shares the same lease before collecting data: %s", async run => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(run()).rejects.toThrow("OPERATION_BUSY");
  expect(withFirestoreLease).toHaveBeenCalledWith("workspace-security", expect.any(Function));
  expect(fetch).not.toHaveBeenCalled();
});

it("reports a scheduled collection as skipped when another collection owns the lease", async () => {
  await expect(syncDailyGoogleWorkspaceSecurity()).resolves.toMatchObject({ status: "skipped_locked", sources: {} });
  expect(withFirestoreLease).toHaveBeenCalledWith("workspace-security", expect.any(Function));
});
