import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import TelemetryStatus, { isTelemetryStale } from "./TelemetryStatus";

afterEach(() => vi.unstubAllGlobals());

it("does not advance collection timestamps when a response is displayed again", () => {
  const data = { status: "ok", collectedAt: new Date(Date.now() - 600_000).toISOString() };
  expect(isTelemetryStale(data, 120_000)).toBe(true);
  expect(isTelemetryStale({ ...data, collectedAt: new Date().toISOString() }, 120_000)).toBe(false);
});

it("requires both a recent collection and a recent historical preservation", () => {
  const data = { status: "ok", collectedAt: new Date().toISOString(), archiveSyncedAt: new Date(Date.now() - 40 * 3600_000).toISOString() };
  expect(isTelemetryStale(data, 120_000)).toBe(true);
  expect(isTelemetryStale({ ...data, archiveSyncedAt: null }, 120_000)).toBe(true);
});

it("identifies incomplete and failed updates without concealing their timestamps", () => {
  vi.stubGlobal("React", React);
  const data = { status: "ok", collectedAt: new Date().toISOString(), truncated: true };
  const html = renderToStaticMarkup(React.createElement(TelemetryStatus, { data, error: true, maxAgeMs: 120_000 }));
  expect(html).toContain("Não foi possível atualizar");
  expect(html).toContain("Dados incompletos");
  expect(html).toContain("Última coleta no n8n");
});
