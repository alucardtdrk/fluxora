import { afterEach, expect, it, vi } from "vitest";
import { customPeriodBounds, isDashboardPeriod, formatCustomPeriod } from "../shared/dashboardPeriod.js";
import { getN8nOverview, getN8nAnalytics, listN8nExecutionsPage, invalidateN8nCache } from "./n8n.js";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); invalidateN8nCache(); });

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
