import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getN8nWorkflowDetail, updateN8nWorkflowNode, restoreN8nWorkflowVersion } from "./workflowEditor.js";

const history = vi.hoisted(() => ({
  workflowHistoryConfigured: vi.fn(() => true), listWorkflowChanges: vi.fn(async () => []),
  saveWorkflowSnapshot: vi.fn(async () => ({ id: "snapshot" })),
  saveWorkflowChange: vi.fn(async () => ({ id: "change" })),
  getWorkflowSnapshot: vi.fn(async () => ({ workflowId: "w1", createdAt: "today", workflow: { id: "w1", nodes: [] } })),
}));
vi.mock("./workflowChanges.js", () => history);
vi.mock("./firestore.js", () => ({ withFirestoreLease: vi.fn(async (_key, operation) => operation(() => {})) }));
const actor = { email: "admin@example.com", role: "admin" as const };
const original = { id: "w1", name: "Workflow", versionId: "v1", nodes: [{ name: "Request", type: "n8n-nodes-base.httpRequest", parameters: { url: "https://example.com" } }] };
let current = original;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("N8N_BASE_URL", "https://n8n.example.com");
  vi.stubEnv("N8N_API_KEY", "test-only");
  vi.stubEnv("CONTROL_ACTIONS_ENABLED", "true");
  current = structuredClone(original);
  vi.clearAllMocks();
  history.saveWorkflowChange.mockResolvedValue({ id: "change" });
  fetchMock = vi.fn(async (_url, init) => new Response(JSON.stringify(init?.method === "PUT" ? { ...current, versionId: "v2" } : current), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("rejects a stale editor without saving a snapshot or sending a PUT", async () => {
  const detail = await getN8nWorkflowDetail("w1");
  current = { ...current, versionId: "v2" };
  const result = await updateN8nWorkflowNode({ workflowId: "w1", nodeName: "Request", expectedVersion: detail.workflow!.revision, changes: [{ path: "url", value: "https://changed.example.com" }] }, actor);
  expect(result.status).toBe("conflict");
  expect(history.saveWorkflowSnapshot).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

it("keeps an applied node edit successful when history persistence fails", async () => {
  const detail = await getN8nWorkflowDetail("w1");
  history.saveWorkflowChange.mockRejectedValueOnce(new Error("unavailable"));
  const result = await updateN8nWorkflowNode({ workflowId: "w1", nodeName: "Request", expectedVersion: detail.workflow!.revision, changes: [{ path: "url", value: "https://changed.example.com" }] }, actor);
  expect(result).toMatchObject({ status: "ok", historyPending: true, workflow: { id: "w1" } });
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
});

it("keeps an applied restore successful when history persistence fails", async () => {
  const detail = await getN8nWorkflowDetail("w1");
  history.saveWorkflowChange.mockRejectedValueOnce(new Error("unavailable"));
  const result = await restoreN8nWorkflowVersion("w1", "snapshot", actor, detail.workflow!.revision);
  expect(result).toMatchObject({ status: "ok", historyPending: true });
});

it("rejects a restore based on an outdated workflow", async () => {
  const result = await restoreN8nWorkflowVersion("w1", "snapshot", actor, "stale");
  expect(result.status).toBe("conflict");
  expect(history.saveWorkflowSnapshot).not.toHaveBeenCalled();
});
