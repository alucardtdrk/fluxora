import { afterEach, expect, it, vi } from "vitest";
import { customPeriodBounds, isDashboardPeriod, formatCustomPeriod, type DashboardPeriod } from "../shared/dashboardPeriod.js";
import { getN8nOverview, getN8nAnalytics, listN8nExecutionsPage, invalidateN8nCache } from "./n8n.js";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); invalidateN8nCache(); });

it("includes the whole final day in Brasilia, including a one-day range", () => {
  expect(customPeriodBounds("custom:2026-11-01:2026-11-01")).toMatchObject({ start: Date.parse("2026-11-01T03:00:00Z"), end: Date.parse("2026-11-02T03:00:00Z") });
  expect(formatCustomPeriod("custom:2026-11-01:2026-11-17")).toBe("01/11/2026 a 17/11/2026");
});
it.each(["custom:2026-02-30:2026-03-01", "custom:2026-11-17:2026-11-01", "custom::", "custom:2026-11-01:invalid", "invalid"])("rejects malformed intervals: %s", value => {
  expect(isDashboardPeriod(value)).toBe(false);
});
it("accepts leap days and existing presets", () => {
  expect(isDashboardPeriod("custom:2024-02-29:2024-03-01")).toBe(true);
  for (const value of ["today", "7d", "30d", "90d", "all"]) expect(isDashboardPeriod(value)).toBe(true);
});
it("filters overview, analytics, errors and executions at both date boundaries", async () => {
  vi.stubEnv("FIREBASE_PROJECT_ID", "");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
  vi.stubEnv("N8N_BASE_URL", "https://custom-period.example.test");
  vi.stubEnv("N8N_API_KEY", "test-only");
  invalidateN8nCache();
  const times = ["2026-11-01T02:59:59.999Z", "2026-11-01T03:00:00.000Z", "2026-11-03T02:59:59.999Z", "2026-11-03T03:00:00.000Z"];
  const executions = times.map((startedAt, index) => ({ id: String(index), workflowId: "wf", status: index === 2 ? "error" : "success", startedAt }));
  vi.stubGlobal("fetch", vi.fn(async url => Response.json({ data: String(url).includes("/workflows") ? [{ id: "wf", name: "Workflow", active: true }] : executions })));
  const period = "custom:2026-11-01:2026-11-02" as const;
  const overview = await getN8nOverview(period);
  expect(overview.metrics).toMatchObject({ executions: 2, errors: 1 });
  expect(overview.chart.map(point => point.day)).toEqual(["01/11", "02/11"]);
  expect(overview.chart.map(point => point.total)).toEqual([1, 1]);
  const analytics = await getN8nAnalytics(period);
  expect(analytics.summary).toMatchObject({ executions: 2, errors: 1 });
  expect(analytics.recentErrors.map(item => item.id)).toEqual(["2"]);
  const page = await listN8nExecutionsPage({ period, page: 1, pageSize: 10 });
  expect(page.items.map(item => item.id).sort()).toEqual(["1", "2"]);
});

it("reconciles October totals with workflows missing from the current catalog", async () => {
  vi.stubEnv("FIREBASE_PROJECT_ID", "");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
  vi.stubEnv("N8N_BASE_URL", "https://october.example.test");
  vi.stubEnv("N8N_API_KEY", "test-only");
  const executions = [
    { id: "1", workflowId: "wf", status: "success", startedAt: "2026-10-01T03:00:00Z" },
    { id: "2", workflowId: "removed", workflowName: "Historical workflow", status: "error", startedAt: "2026-11-01T02:59:59.999Z" },
    { id: "3", status: "success", startedAt: "2026-10-17T03:00:00Z" },
    { id: "4", workflowId: "wf", status: "error", startedAt: "2026-11-01T03:00:00Z" },
    { id: "5", workflowId: "wf", status: "error", startedAt: "2026-10-01T02:59:59.999Z" },
  ];
  vi.stubGlobal("fetch", vi.fn(async url => Response.json({ data: String(url).includes("/workflows") ? [{ id: "wf", name: "Current workflow", active: true }] : executions })));
  const analytics = await getN8nAnalytics("custom:2026-10-01:2026-10-31");
  expect(analytics.summary).toMatchObject({ executions: 3, success: 2, errors: 1 });
  expect(analytics.workflowStats.reduce((sum, row) => sum + row.executions, 0)).toBe(3);
  expect(analytics.workflowStats.reduce((sum, row) => sum + row.errors, 0)).toBe(1);
  expect(analytics.workflowStats).toEqual(expect.arrayContaining([expect.objectContaining({ id: "removed", name: "Historical workflow", errors: 1 })]));
  expect(analytics.comparison).toMatchObject({ previous: { total: 1 }, recent: { total: 2 }, successRateDelta: -50 });
});

async function customCharts(period: DashboardPeriod, times: string[], incomplete = false) {
  vi.stubEnv("FIREBASE_PROJECT_ID", "");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
  vi.stubEnv("N8N_BASE_URL", "https://custom-chart.example.test");
  vi.stubEnv("N8N_API_KEY", "test-only");
  vi.stubEnv("N8N_MAX_PAGES", "1");
  invalidateN8nCache();
  vi.stubGlobal("fetch", vi.fn(async url => Response.json(String(url).includes("/workflows")
    ? { data: [{ id: "wf", name: "Workflow", active: true }] }
    : { data: times.map((startedAt, index) => ({ id: String(index), workflowId: "wf", status: index % 2 ? "error" : "success", startedAt })), ...(incomplete ? { nextCursor: "more" } : {}) })));
  return { overview: await getN8nOverview(period), analytics: await getN8nAnalytics(period) };
}

it("keeps the partial first day of rolling periods in both charts", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T15:00:00Z"));
  const { overview, analytics } = await customCharts("7d", ["2026-11-18T14:00:00Z", "2026-11-11T16:00:00Z"]);
  expect(overview.metrics?.executions).toBe(2);
  expect(overview.chart.reduce((sum, row) => sum + row.total, 0)).toBe(2);
  expect(analytics.trend.reduce((sum, row) => sum + row.total, 0)).toBe(2);
  expect(analytics.trend[0].date).toBe("11/11/2026");
  expect(analytics.trend.at(-1)?.date).toBe("18/11/2026");
});

it("includes executions older than thirty days when plotting all history", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T15:00:00Z"));
  const { overview, analytics } = await customCharts("all", ["2026-11-18T14:00:00Z", "2026-01-01T03:00:00Z"]);
  expect(overview.metrics?.executions).toBe(2);
  expect(overview.chart.reduce((sum, row) => sum + row.total, 0)).toBe(2);
  expect(analytics.trend.reduce((sum, row) => sum + row.total, 0)).toBe(2);
  expect(analytics.trend[0].date).toContain("01/01/2026");
});

it("keeps the ninety-day preset daily including its partial first day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T15:00:00Z"));
  const { overview } = await customCharts("90d", [new Date(Date.now() - 90 * 86400_000 + 60_000).toISOString()]);
  expect(overview.chart).toHaveLength(91);
  expect(overview.chart[0].total).toBe(1);
  expect(overview.chart.reduce((sum, row) => sum + row.total, 0)).toBe(overview.metrics?.executions);
});

it("fills intermediate custom dates and keeps both charts chronological", async () => {
  const { overview, analytics } = await customCharts("custom:2026-11-01:2026-11-04", ["2026-11-04T03:00:00Z", "2026-11-01T03:00:00Z"]);
  expect(overview.chart.map(row => row.total)).toEqual([1, 0, 0, 1]);
  expect(analytics.trend.map(row => row.total)).toEqual([1, 0, 0, 1]);
  expect(analytics.trend.map(row => row.date)).toEqual(["01/11/2026", "02/11/2026", "03/11/2026", "04/11/2026"]);
});
it("includes an entirely empty custom range", async () => {
  const { overview, analytics } = await customCharts("custom:2026-11-01:2026-11-03", []);
  expect(overview.chart.map(row => row.total)).toEqual([0, 0, 0]);
  expect(analytics.trend.map(row => row.total)).toEqual([0, 0, 0]);
});
it("groups long ranges weekly, retaining partial last weeks and exact totals", async () => {
  const { overview, analytics } = await customCharts("custom:2026-01-01:2026-04-02", ["2026-01-01T03:00:00Z", "2026-01-07T03:00:00Z", "2026-04-02T03:00:00Z"]);
  expect(overview.chart).toHaveLength(14);
  expect(overview.chart[0]).toMatchObject({ day: "01/01/2026 a 07/01/2026", total: 2, sucesso: 1, erro: 1 });
  expect(analytics.trend.at(-1)).toMatchObject({ date: "02/04/2026 a 02/04/2026", total: 1 });
  expect(analytics.trend.reduce((sum, row) => sum + row.total, 0)).toBe(3);
});
it("groups very long ranges monthly across years and leap days", async () => {
  const { overview, analytics } = await customCharts("custom:2024-02-28:2025-03-02", ["2024-02-29T03:00:00Z", "2025-03-02T03:00:00Z"]);
  expect(overview.chart).toHaveLength(14);
  expect(analytics.trend[0]).toMatchObject({ date: "28/02/2024 a 29/02/2024", total: 1 });
  expect(analytics.trend.at(-1)).toMatchObject({ date: "01/03/2025 a 02/03/2025", total: 1 });
});
it("does not invent zeroes when the custom query is incomplete", async () => {
  const { overview, analytics } = await customCharts("custom:2026-11-01:2026-11-03", ["2026-11-03T03:00:00Z"], true);
  expect(overview.truncated).toBe(true);
  expect(overview.chart).toEqual([]);
  expect(analytics.trend).toEqual([]);
  expect(analytics.comparison).toBeNull();
});
