import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Monitoring from "./Monitoring";

vi.mock("@/components/OperationsShell", () => ({ default: ({ children }: any) => children }));
vi.mock("@/components/IncidentAttentionCenter", () => ({ default: () => null }));
vi.mock("@/lib/preferences", () => ({ readPreferredRefreshSeconds: () => 60, readOperationalAlertPreferences: () => ({ errorThreshold: 5, inactiveHours: 24 }), PREFERENCES_UPDATED_EVENT: "preferences" }));
vi.mock("@/lib/trpc", () => ({ trpc: { n8n: {
  overview: { useQuery: () => ({ data: { metrics: { executions: 200, success: 90, errors: 10, canceled: 100, inactiveActiveWorkflows: 0 } }, isPending: false }) },
  analytics: { useQuery: () => ({ data: { workflowStats: [], anomalies: [], incidentGroups: [] }, isPending: false }) },
  workflows: { useQuery: () => ({ data: { items: [] }, isPending: false }) },
  archiveStatus: { useQuery: () => ({ data: { configured: false }, isPending: false }) },
} } }));
afterEach(() => vi.unstubAllGlobals());

it("uses success and errors as the denominator of monitoring alerts", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(Monitoring));
  expect(html).toContain("A taxa de falhas está em 10.0%");
  expect(html).not.toContain("A taxa de falhas está em 5.0%");
});
