import { afterEach, expect, it, vi } from "vitest";
import { createGoogleWorkspaceRepository, pruneExpiredWorkspaceEvents, WORKSPACE_SECURITY_FINDINGS_COLLECTION } from "./repository.js";
import { createWorkspaceSecurityDashboard } from "./dashboard.js";
const store = vi.hoisted(() => ({ runFirestoreQuery: vi.fn(), deleteFirestoreDocument: vi.fn(async () => ({ deleted: true })) }));
vi.mock("../firestore.js", async original => ({ ...await original<typeof import("../firestore.js")>(), ...store }));
afterEach(() => vi.resetAllMocks());

it("reads beyond 1000 events, with a document-name tie breaker", async () => {
  const rows = Array.from({ length: 1001 }, (_, id) => ({ id: String(id), _documentName: `projects/test/databases/(default)/documents/events/${id}`, occurredAt: new Date(), observedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }));
  store.runFirestoreQuery.mockResolvedValueOnce(rows.slice(0, 1000)).mockResolvedValueOnce(rows.slice(1000));
  const events = await createGoogleWorkspaceRepository().listRecentEvents(new Date(Date.now() - 86_400_000));
  expect(events).toHaveLength(1001);
  expect(store.runFirestoreQuery.mock.calls[0][0].orderBy).toEqual([
    { field: { fieldPath: "occurredAt" }, direction: "ASCENDING" }, { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
  ]);
  expect(store.runFirestoreQuery.mock.calls[1][0].startAt.values[1]).toEqual({ referenceValue: rows[999]._documentName });
});

it("does not turn a failed later page into an apparently complete analysis", async () => {
  store.runFirestoreQuery.mockResolvedValueOnce(Array.from({ length: 1000 }, (_, id) => ({ _documentName: `events/${id}`, occurredAt: new Date() }))).mockRejectedValueOnce(new Error("offline"));
  await expect(createGoogleWorkspaceRepository().listRecentEvents(new Date())).rejects.toThrow("offline");
});

it("removes expired findings from both the list and open count before cleanup runs", async () => {
  const result = await createWorkspaceSecurityDashboard({ listEvents: async () => [], getPosture: async () => null, listFindings: async () => [
    { id: "expired", expiresAt: new Date(Date.now() - 1000) }, { id: "active", expiresAt: new Date(Date.now() + 60_000) },
  ] }).load();
  expect(result.findings.map(finding => finding.id)).toEqual(["active"]);
  expect(result.summary.openFindings).toBe(1);
});

it("cleans up expired finding documents as well as events", async () => {
  store.runFirestoreQuery.mockImplementation(async query => query.from[0].collectionId === WORKSPACE_SECURITY_FINDINGS_COLLECTION ? [{ _documentId: "expired-finding" }] : []);
  await pruneExpiredWorkspaceEvents();
  expect(store.deleteFirestoreDocument).toHaveBeenCalledWith(WORKSPACE_SECURITY_FINDINGS_COLLECTION, "expired-finding");
});
