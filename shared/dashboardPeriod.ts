export type PresetPeriod = "today" | "7d" | "30d" | "90d" | "all";
export type DashboardPeriod = PresetPeriod | `custom:${string}:${string}`;

export function customPeriodBounds(value: string) {
  const match = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (!match) return null;
  const [, startDate, endDate] = match;
  for (const date of [startDate, endDate]) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  }
  if (startDate > endDate) return null;
  return { startDate, endDate, start: Date.parse(`${startDate}T00:00:00-03:00`), end: Date.parse(`${endDate}T00:00:00-03:00`) + 86_400_000 };
}

export function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return typeof value === "string" && (["today", "7d", "30d", "90d", "all"].includes(value) || customPeriodBounds(value) !== null);
}

export function formatCustomPeriod(value: string) {
  const range = customPeriodBounds(value);
  return range ? `${range.startDate.split("-").reverse().join("/")} a ${range.endDate.split("-").reverse().join("/")}` : "Personalizado";
}
