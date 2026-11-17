import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import PeriodFilter from "./PeriodFilter";
import { readScopedPeriod, saveScopedPeriod } from "@/lib/preferences";
vi.mock("framer-motion", () => ({ LayoutGroup: ({ children }: any) => children, useReducedMotion: () => true, motion: { span: ({ children, className }: any) => React.createElement("span", { className }, children) } }));
afterEach(() => vi.unstubAllGlobals());
it("offers a custom interval alongside the existing shortcuts", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(PeriodFilter, { value: "7d", options: [["today", "Hoje"], ["7d", "7 dias"]], onChange: vi.fn() }));
  expect(html).toContain("Selecionar período personalizado");
  expect(html).toContain("Hoje");
  expect(html).toContain("7 dias");
});
it("displays the applied interval in the custom button", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(PeriodFilter, { value: "custom:2026-11-01:2026-11-17", options: [["today", "Hoje"]], onChange: vi.fn() }));
  expect(html).toContain("01/11/2026 a 17/11/2026");
  expect(html).not.toContain('aria-pressed="true"');
});
it("remembers valid custom intervals and ignores invalid saved ranges", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  saveScopedPeriod("home", "custom:2026-11-01:2026-11-17");
  expect(readScopedPeriod("home")).toBe("custom:2026-11-01:2026-11-17");
  storage.set("fluxoraPeriod:home", "custom:2026-02-30:2026-03-01");
  expect(readScopedPeriod("home", "7d")).toBe("7d");
});
