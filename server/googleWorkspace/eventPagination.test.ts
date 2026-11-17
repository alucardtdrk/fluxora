import { afterEach, expect, it, vi } from "vitest";
import { createWorkspaceEventPage, getWorkspaceEventPage } from "./dashboard.js";
import type { WorkspaceEventCursor } from "../../shared/workspaceSecurity.js";
const store = vi.hoisted(() => ({ runFirestoreQuery: vi.fn(), isFirestoreConfigured: vi.fn(() => true) }));
vi.mock("../firestore.js", async original => ({ ...await original<typeof import("../firestore.js")>(), ...store }));
const name = (id: string) => `projects/test/databases/(default)/documents/fluxora/data/workspace-security-events/${id}`;
const record = (id: string, source = "drive", date = "2026-11-17T10:00:00Z") => ({ id, _documentName: name(id), occurredAt: date, source, category: "data_protection", severity: "low" });
const reader = (records: ReturnType<typeof record>[]) => async (cursor: WorkspaceEventCursor | null, limit: number) => {
  const index = cursor ? records.findIndex(item => item._documentName === cursor.documentName) + 1 : 0;
  return records.slice(index, index + limit);
};
afterEach(() => vi.clearAllMocks());

it("marks a sparse search incomplete and continues beyond 500 nonmatching records", async () => {
  const records = Array.from({ length: 501 }, (_, index) => record(String(index), index === 500 ? "login" : "drive"));
  const first = await createWorkspaceEventPage({ source: "login" }, reader(records));
  expect(first.events).toEqual([]);
  expect(first.searchIncomplete).toBe(true);
  expect(first.nextCursor?.documentName).toBe(name("499"));
  const second = await createWorkspaceEventPage({ source: "login", cursor: first.nextCursor }, reader(records));
  expect(second.events.map(event => event.id)).toEqual(["500"]);
  expect(second.nextCursor).toBeNull();
  expect(second.searchIncomplete).toBe(false);
});

it("uses the document name to continue tied timestamps without duplicating after a new insertion", async () => {
  const records = [record("c"), record("b"), record("a")];
  const first = await createWorkspaceEventPage({ pageSize: 2 }, reader(records));
  records.unshift(record("d"));
  const second = await createWorkspaceEventPage({ pageSize: 2, cursor: first.nextCursor }, reader(records));
  expect(first.events.map(event => event.id)).toEqual(["c", "b"]);
  expect(second.events.map(event => event.id)).toEqual(["a"]);
});

it("stops scanning once records are older than the requested period", async () => {
  const list = vi.fn(reader(Array.from({ length: 100 }, (_, index) => record(String(index), "login", "2020-01-01T00:00:00Z"))));
  const result = await createWorkspaceEventPage({ periodDays: 1 }, list);
  expect(result.nextCursor).toBeNull();
  expect(result.searchIncomplete).toBe(false);
  expect(list).toHaveBeenCalledTimes(1);
});

it("queries by a stable date/document cursor and filters the period in Firestore", async () => {
  store.runFirestoreQuery.mockResolvedValueOnce([]);
  const cursor = { occurredAt: "2026-11-17T10:00:00.000Z", documentName: name("event") };
  await getWorkspaceEventPage({ periodDays: 7, cursor });
  expect(store.runFirestoreQuery).toHaveBeenCalledWith(expect.objectContaining({
    orderBy: [{ field: { fieldPath: "occurredAt" }, direction: "DESCENDING" }, { field: { fieldPath: "__name__" }, direction: "DESCENDING" }],
    startAt: { before: false, values: [{ timestampValue: cursor.occurredAt }, { referenceValue: cursor.documentName }] },
    where: { fieldFilter: { field: { fieldPath: "occurredAt" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: expect.any(String) } } },
  }));
  expect(store.runFirestoreQuery.mock.calls[0][0]).not.toHaveProperty("offset");
});
