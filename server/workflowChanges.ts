import crypto from "node:crypto";
import { deleteFirestoreDocument, getFirestoreDocument, isFirestoreConfigured, runFirestoreQuery, setFirestoreDocument, type FirestoreRecord } from "./firestore.js";

export type WorkflowSnapshot = {
  id: string;
  workflowId: string;
  workflowName: string;
  actor: string;
  actorRole: string;
  reason: string;
  createdAt: string;
  workflow: Record<string, unknown>;
};

export type WorkflowChange = {
  id: string;
  workflowId: string;
  workflowName: string;
  actor: string;
  actorRole: string;
  type: "update" | "restore";
  createdAt: string;
  summary: string;
  nodeNames: string[];
  snapshotId: string;
  restoredFromSnapshotId?: string | null;
};

const SNAPSHOT_COLLECTION = "fluxora_workflow_snapshots";
const CHANGE_COLLECTION = "fluxora_workflow_changes";
const OUTBOX_COLLECTION = "fluxora_workflow_change_outbox";

type PendingWorkflowChange = WorkflowChange & { targetDigest: string; baseVersion: string };

export function workflowContentDigest(workflow: Record<string, unknown>) {
  const content = [workflow.name, workflow.nodes ?? [], workflow.connections ?? {}, workflow.settings ?? {}, workflow.staticData ?? null];
  const canonical = JSON.stringify(content, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function randomId() {
  return crypto.randomUUID();
}

function encodeDocumentId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function changeQueryLimit() {
  const parsed = Number(process.env.FLUXORA_WORKFLOW_HISTORY_LIMIT || "100");
  return Number.isFinite(parsed) ? Math.max(10, Math.min(300, Math.floor(parsed))) : 100;
}

export function workflowHistoryConfigured() {
  return isFirestoreConfigured();
}

export async function saveWorkflowSnapshot(input: Omit<WorkflowSnapshot, "id" | "createdAt">) {
  if (!workflowHistoryConfigured()) throw new Error("FIREBASE_NOT_CONFIGURED");
  const createdAt = new Date().toISOString();
  const id = encodeDocumentId(`${input.workflowId}_${Date.now()}_${randomId()}`);
  const snapshot: WorkflowSnapshot = { ...input, id, createdAt };
  await setFirestoreDocument(SNAPSHOT_COLLECTION, id, snapshot as unknown as FirestoreRecord);
  return snapshot;
}

export async function getWorkflowSnapshot(id: string) {
  if (!workflowHistoryConfigured()) return null;
  const document = await getFirestoreDocument(SNAPSHOT_COLLECTION, id);
  return document ? (document as unknown as WorkflowSnapshot) : null;
}

export async function queueWorkflowChange(input: Omit<WorkflowChange, "id" | "createdAt">, targetDigest: string, baseVersion: string) {
  if (!workflowHistoryConfigured()) throw new Error("FIREBASE_NOT_CONFIGURED");
  const createdAt = new Date().toISOString();
  const id = encodeDocumentId(`${input.workflowId}_${Date.now()}_${randomId()}`);
  const change: PendingWorkflowChange = { ...input, id, createdAt, targetDigest, baseVersion };
  await setFirestoreDocument(OUTBOX_COLLECTION, id, change as unknown as FirestoreRecord);
  return change;
}

export async function finishWorkflowChange(pending: PendingWorkflowChange) {
  const { targetDigest: _targetDigest, baseVersion: _baseVersion, ...change } = pending;
  const id = change.id;
  await setFirestoreDocument(CHANGE_COLLECTION, id, change as unknown as FirestoreRecord);
  // Reusing the same id makes concurrent recovery and failed queue cleanup safe.
  await deleteFirestoreDocument(OUTBOX_COLLECTION, id).catch(() => {});
  return change;
}

export async function recoverWorkflowChanges(workflowId: string, currentDigest: string, currentVersion: string) {
  if (!workflowHistoryConfigured()) return { recovered: 0, pending: 0 };
  const rows = await runFirestoreQuery({ from: [{ collectionId: OUTBOX_COLLECTION }], where: { fieldFilter: { field: { fieldPath: "workflowId" }, op: "EQUAL", value: { stringValue: workflowId } } } });
  let recovered = 0;
  for (const row of rows) {
    try {
      if (await getFirestoreDocument(CHANGE_COLLECTION, String(row.id))) {
        await deleteFirestoreDocument(OUTBOX_COLLECTION, String(row.id));
        recovered++;
        continue;
      }
      if (row.targetDigest !== currentDigest || row.baseVersion === currentVersion) continue;
      await finishWorkflowChange(row as unknown as PendingWorkflowChange);
      recovered++;
    } catch { /* The durable intent remains for the next read. */ }
  }
  return { recovered, pending: rows.length - recovered };
}

export async function listWorkflowChanges(workflowId: string) {
  if (!workflowHistoryConfigured()) return [] as WorkflowChange[];
  const rows = await runFirestoreQuery({
    from: [{ collectionId: CHANGE_COLLECTION }],
    where: {
      fieldFilter: {
        field: { fieldPath: "workflowId" },
        op: "EQUAL",
        value: { stringValue: workflowId },
      },
    },
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
    limit: changeQueryLimit(),
  });

  return rows.map((row) => ({
    id: String(row.id || row._documentId || ""),
    workflowId: String(row.workflowId || workflowId),
    workflowName: String(row.workflowName || "Workflow"),
    actor: String(row.actor || "desconhecido"),
    actorRole: String(row.actorRole || "viewer"),
    type: row.type === "restore" ? "restore" : "update",
    createdAt: String(row.createdAt || ""),
    summary: String(row.summary || ""),
    nodeNames: Array.isArray(row.nodeNames) ? row.nodeNames.map((value) => String(value)) : [],
    snapshotId: String(row.snapshotId || ""),
    restoredFromSnapshotId: row.restoredFromSnapshotId == null ? null : String(row.restoredFromSnapshotId),
  })).filter((row) => row.id);
}
