import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Users from "./Users";
import Executions from "./Executions";
import { toast } from "sonner";

const queries = vi.hoisted(() => ({ users: {} as any, executions: {} as any, workflows: {} as any, refresh: undefined as undefined | (() => Promise<void>) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({}),
  admin: { users: { useQuery: () => queries.users }, saveUser: { useMutation: () => ({}) }, setUserActive: { useMutation: () => ({}) }, deleteUser: { useMutation: () => ({}) } },
  n8n: { executionsPage: { useQuery: () => queries.executions }, workflows: { useQuery: () => queries.workflows } },
} }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { email: "admin@example.com", role: "admin" } }) }));
vi.mock("@/components/OperationsShell", () => ({ default: ({ children }: any) => children }));
vi.mock("@/components/PeriodFilter", () => ({ default: () => null }));
vi.mock("@/components/ExecutionDetailDialog", () => ({ default: () => null }));
vi.mock("@/components/ExecutionComparisonDialog", () => ({ default: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, "aria-busy": busy }: any) => {
  if (busy !== undefined) queries.refresh = onClick;
  return React.createElement("button", null, children);
} }));
vi.mock("wouter", () => ({ Link: ({ children }: any) => children, useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/lib/preferences", () => ({ readPreferredPageSize: () => 50, readScopedPeriod: () => "30d", rememberFiltersEnabled: () => false, saveScopedPeriod: vi.fn(), PREFERENCES_UPDATED_EVENT: "preferences" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { location: { search: "" } });
  queries.users = { data: undefined, isError: false, isLoading: false };
  queries.executions = { isFetching: false, data: { status: "ok", items: [], total: 0 }, refetch: vi.fn(async () => ({ data: { status: "ok" } })) };
  queries.workflows = { isFetching: false, data: { status: "ok", items: [] }, refetch: vi.fn(async () => ({ data: { status: "ok" } })) };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

it("shows a users loading state", () => {
  queries.users.isLoading = true;
  expect(renderToStaticMarkup(React.createElement(Users))).toContain("Carregando usuários");
});
it("associates access form labels with their fields", () => {
  const html = renderToStaticMarkup(React.createElement(Users));
  for (const id of ["access-name", "access-email", "access-role"]) {
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(`id="${id}"`);
  }
});
it("shows a users failure instead of declaring an empty list", () => {
  queries.users.isError = true;
  const html = renderToStaticMarkup(React.createElement(Users));
  expect(html).toContain("Não foi possível carregar os usuários");
  expect(html).not.toContain("Nenhum usuário encontrado");
});
it("preserves the user list when a refresh fails", () => {
  queries.users = { isError: true, data: [{ email: "ana@example.com", name: "Ana", role: "viewer", active: true }] };
  const html = renderToStaticMarkup(React.createElement(Users));
  expect(html).toContain("ana@example.com");
  expect(html).toContain("Não foi possível carregar os usuários");
});
it.each(["transport", "api_error", "unauthorized", "not_configured"])("does not report refreshed executions after %s", async failure => {
  queries.executions.refetch.mockResolvedValueOnce(failure === "transport" ? { error: new Error("offline") } : { data: { status: failure } });
  renderToStaticMarkup(React.createElement(Executions));
  await queries.refresh!();
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalled();
});
it("reports success after both execution and workflow refreshes succeed", async () => {
  renderToStaticMarkup(React.createElement(Executions));
  await queries.refresh!();
  expect(toast.success).toHaveBeenCalledWith("Histórico atualizado");
});
