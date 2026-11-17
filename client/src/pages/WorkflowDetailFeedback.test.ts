import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WorkflowDetail from "./WorkflowDetail";
import { toast } from "sonner";
const state = vi.hoisted(() => ({ detail: {} as any, executions: {} as any, refresh: undefined as undefined | (() => Promise<void>) }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { role: "admin" } }) }));
vi.mock("@/components/OperationsShell", () => ({ default: ({ children }: any) => children }));
vi.mock("@/components/ExecutionDetailDialog", () => ({ default: () => null }));
vi.mock("wouter", () => ({ Link: ({ children }: any) => children, useRoute: () => [true, { id: "wf" }] }));
vi.mock("@/lib/preferences", () => ({ readPreferredPageSize: () => 50, PREFERENCES_UPDATED_EVENT: "preferences" }));
vi.mock("@/lib/trpc", () => ({ trpc: { n8n: {
  workflowDetail: { useQuery: () => state.detail }, executions: { useQuery: () => state.executions },
  workflows: { useQuery: () => ({ data: { items: [] } }) }, executionDetail: { useQuery: () => ({ isFetching: false }) },
  toggleWorkflow: { useMutation: () => ({}) }, updateWorkflowNode: { useMutation: () => ({}) }, restoreWorkflowVersion: { useMutation: () => ({}) },
} } }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, "aria-busy": busy }: any) => { if (busy !== undefined) state.refresh = onClick; return React.createElement("button", null, children); } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  state.detail = { isFetching: false, data: { status: "ok", historyConfigured: true, workflow: { id: "wf", name: "Workflow", nodes: [], nodeCount: 0 } }, refetch: vi.fn(async () => ({ data: { status: "ok" } })) };
  state.executions = { isFetching: false, data: { items: [] }, refetch: vi.fn(async () => ({ data: { status: "ok" } })) };
});
afterEach(() => vi.unstubAllGlobals());
it.each(["transport", "api_error", "unauthorized", "not_configured"])("does not report success when a workflow refresh returns %s", async failure => {
  state.detail.refetch.mockResolvedValueOnce(failure === "transport" ? { error: new Error("offline") } : { data: { status: failure } });
  renderToStaticMarkup(React.createElement(WorkflowDetail));
  await state.refresh!();
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalled();
});
it("does not report success when execution history fails to refresh", async () => {
  state.executions.refetch.mockResolvedValueOnce({ error: new Error("offline") });
  renderToStaticMarkup(React.createElement(WorkflowDetail));
  await state.refresh!();
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalled();
});
it("reports success after all requested data refreshes succeed", async () => {
  renderToStaticMarkup(React.createElement(WorkflowDetail));
  await state.refresh!();
  expect(toast.success).toHaveBeenCalledWith("Workflow atualizado");
});
