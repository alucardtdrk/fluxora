import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Insights, { ErrorsInsights } from "./Insights";
import { toast } from "sonner";

const state = vi.hoisted(() => ({ query: {} as any, fetch: vi.fn(), setData: vi.fn(), refresh: undefined as undefined | (() => Promise<void>) }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ n8n: { analytics: { fetch: state.fetch, setData: state.setData, cancel: vi.fn() } } }), n8n: {
  analytics: { useQuery: () => state.query },
} } }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { role: "admin" } }) }));
vi.mock("@/components/OperationsShell", () => ({ default: ({ children }: any) => children }));
vi.mock("@/components/IncidentAttentionCenter", () => ({ default: () => null }));
vi.mock("@/components/ExecutionDetailDialog", () => ({ default: () => null }));
vi.mock("@/components/PeriodFilter", () => ({ default: () => null }));
vi.mock("wouter", () => ({ Link: ({ children }: any) => children }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, "aria-busy": busy }: any) => {
  if (busy !== undefined) state.refresh = onClick;
  return React.createElement("button", null, children);
} }));
vi.mock("@/lib/preferences", () => ({ readPreferredRefreshSeconds: () => 60, readScopedPeriod: () => "7d", readPreferredPageSize: () => 50, saveScopedPeriod: vi.fn(), PREFERENCES_UPDATED_EVENT: "preferences" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  state.query = { isPending: false, isFetching: false, isError: false, data: {
    status: "ok", connected: true, collectedAt: new Date().toISOString(), summary: { executions: 2, errors: 1, successRate: 50 },
    workflowStats: [], trend: [], recentErrors: [], nodeStats: [],
  }, refetch: vi.fn() };
  state.fetch.mockImplementation(async () => {
    const result = await state.query.refetch();
    if (result.isError) throw new Error("Transport failure");
    return result.data;
  });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("shows the comparison's actual ranges and unrounded rates, regardless of the selected preset", () => {
  state.query.data.comparison = {
    executionsDelta: -68.5, errorsDelta: -62.5, successRateDelta: -0.05,
    previous: { total: 11029, errors: 32, successRate: 99.709592522, startDate: "2026-10-01", endDate: "2026-10-16" },
    recent: { total: 3477, errors: 12, successRate: 99.654676259, startDate: "2026-10-17", endDate: "2026-10-31" },
  };
  const html = renderToStaticMarkup(React.createElement(Insights));
  for (const text of ["01/10/2026 a 16/10/2026", "17/10/2026 a 31/10/2026", "11.029", "3.477", "99,7096%", "99,6547%", "-0,05 p.p."]) expect(html).toContain(text);
  expect(html).toContain("Evolução dentro do período");
});

it("identifies comparison rates without a baseline instead of inventing percentages", () => {
  const empty = { total: 0, errors: 0, successRate: null, startDate: null, endDate: null };
  state.query.data.comparison = { executionsDelta: null, errorsDelta: null, successRateDelta: null, previous: empty, recent: empty };
  const html = renderToStaticMarkup(React.createElement(Insights));
  expect(html).toContain("Sem base");
  expect(html).toContain("Datas indisponíveis");
  expect(html).not.toContain("NaN");
});

for (const [name, Page] of [["analytics", Insights], ["errors", ErrorsInsights]] as const) {
  const render = () => renderToStaticMarkup(React.createElement(Page));

  it.each(["transport", "api_error", "stale", "incomplete"])(`does not confirm refreshed ${name} after %s`, async failure => {
    const data = failure === "api_error" ? { status: "api_error", summary: null } : {
      ...state.query.data,
      ...(failure === "stale" ? { collectedAt: new Date(Date.now() - 600_000).toISOString() } : {}),
      ...(failure === "incomplete" ? { truncated: true } : {}),
    };
    state.query.refetch.mockResolvedValue({ isError: failure === "transport", data });
    render();
    await state.refresh!();
    expect(state.fetch).toHaveBeenCalledWith({ period: "7d", forceRefresh: true }, { staleTime: 0 });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it(`confirms refreshed ${name} only after a new successful collection`, async () => {
    state.query.refetch.mockResolvedValue({ isError: false, data: state.query.data });
    render();
    await state.refresh!();
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it(`identifies unavailable ${name} metrics instead of measured zeroes`, () => {
    state.query.data = { status: "api_error", summary: null, workflowStats: [], trend: [], recentErrors: [], nodeStats: [] };
    const html = render();
    expect(html).toContain("Não foi possível atualizar");
    const values = [...html.matchAll(/text-3xl font-semibold[^>]*>([^<]+)/g)].map(match => match[1]);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every(value => value === "—")).toBe(true);
  });
}
