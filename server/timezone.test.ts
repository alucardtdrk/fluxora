import { expect, it } from "vitest";
import { brazilDateKey, startOfBrazilDay } from "../shared/timezone.js";

it.each([
  ["2026-11-06T02:59:59Z", "2026-11-05", "2026-11-05T03:00:00.000Z"],
  ["2026-11-06T03:00:00Z", "2026-11-06", "2026-11-06T03:00:00.000Z"],
  ["2027-01-01T01:00:00Z", "2026-12-31", "2026-12-31T03:00:00.000Z"],
  ["2028-03-01T02:00:00Z", "2028-02-29", "2028-02-29T03:00:00.000Z"],
])("uses the Brasilia calendar for %s", (instant, day, midnight) => {
  expect(brazilDateKey(new Date(instant))).toBe(day);
  expect(startOfBrazilDay(new Date(instant)).toISOString()).toBe(midnight);
});
