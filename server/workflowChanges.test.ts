import { afterEach, expect, it, vi } from "vitest";
import { queueWorkflowChange, finishWorkflowChange, recoverWorkflowChanges, workflowContentDigest } from "./workflowChanges.js";
const db = vi.hoisted(() => ({ documents: new Map<string, any>(), failHistory: false, failDelete: false }));
vi.mock("./firestore.js", () => ({
  isFirestoreConfigured: () => true,
  getFirestoreDocument: async (collection: string, id: string) => db.documents.get(`${collection}/${id}`) ?? null,
  setFirestoreDocument: async (collection: string, id: string, data: any) => {
    if (collection === "fluxora_workflow_changes" && db.failHistory) throw new Error("offline");
    db.documents.set(`${collection}/${id}`, structuredClone(data));
  },
  deleteFirestoreDocument: async (collection: string, id: string) => {
    if (db.failDelete) throw new Error("offline");
    db.documents.delete(`${collection}/${id}`);
  },
  runFirestoreQuery: async (query: any) => [...db.documents.entries()].filter(([key, data]) => key.startsWith(`${query.from[0].collectionId}/`) && data.workflowId === query.where.fieldFilter.value.stringValue).map(([, data]) => data),
}));
afterEach(() => { db.documents.clear(); db.failHistory = false; db.failDelete = false; });
const input = { workflowId: "wf", workflowName: "Workflow", actor: "ana@example.com", actorRole: "admin", type: "update" as const, summary: "Ajuste", nodeNames: ["Request"], snapshotId: "snapshot" };

it("persists the intent before application and recovers history after a storage outage", async () => {
  const pending = await queueWorkflowChange(input, "target-digest", "v1");
  db.failHistory = true;
  await expect(finishWorkflowChange(pending)).rejects.toThrow("offline");
  expect(db.documents.has(`fluxora_workflow_change_outbox/${pending.id}`)).toBe(true);
  db.failHistory = false;
  expect(await recoverWorkflowChanges("wf", "target-digest", "v2")).toEqual({ recovered: 1, pending: 0 });
  expect(db.documents.get(`fluxora_workflow_changes/${pending.id}`)).toMatchObject({ createdAt: pending.createdAt, ...input });
  expect(db.documents.has(`fluxora_workflow_change_outbox/${pending.id}`)).toBe(false);
});
it("does not invent a successful change when the remote workflow was never updated", async () => {
  await queueWorkflowChange(input, "target-digest", "v1");
  expect(await recoverWorkflowChanges("wf", "target-digest", "v1")).toEqual({ recovered: 0, pending: 1 });
});
it("keeps unverifiable changes pending if the workflow has different content", async () => {
  await queueWorkflowChange(input, "target-digest", "v1");
  expect(await recoverWorkflowChanges("wf", "other-digest", "v3")).toEqual({ recovered: 0, pending: 1 });
});
it("retries with the same history id if queue cleanup fails, without duplicates", async () => {
  const pending = await queueWorkflowChange(input, "target-digest", "v1");
  db.failDelete = true;
  await finishWorkflowChange(pending);
  db.failDelete = false;
  await recoverWorkflowChanges("wf", "later-digest", "v3");
  expect([...db.documents.keys()].filter(key => key.startsWith("fluxora_workflow_changes/"))).toEqual([`fluxora_workflow_changes/${pending.id}`]);
  expect(db.documents.has(`fluxora_workflow_change_outbox/${pending.id}`)).toBe(false);
});

it("compares workflow content independently of property order and remote version metadata", () => {
  const first = { name: "Flow", versionId: "v1", nodes: [{ name: "Request", parameters: { url: "https://example.com", method: "GET" } }] };
  const second = { versionId: "v2", nodes: [{ parameters: { method: "GET", url: "https://example.com" }, name: "Request" }], name: "Flow" };
  expect(workflowContentDigest(first)).toBe(workflowContentDigest(second));
  expect(workflowContentDigest({ ...first, name: "Changed" })).not.toBe(workflowContentDigest(first));
});
