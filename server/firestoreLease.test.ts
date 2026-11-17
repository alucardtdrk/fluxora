import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withFirestoreLease } from "./firestore.js";

let documents: Map<string, any>;
let serial = 0;
beforeEach(() => {
  documents = new Map();
  vi.stubEnv("FIREBASE_PROJECT_ID", "test");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "test@example.com");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (String(url).includes("oauth2.googleapis.com")) return Response.json({ access_token: "test", expires_in: 3600 });
    const path = new URL(String(url));
    const key = path.pathname;
    const stored = documents.get(key);
    if (init?.method === "PATCH") {
      const expected = path.searchParams.get("currentDocument.updateTime");
      if ((path.searchParams.get("currentDocument.exists") === "false" && stored) || (expected && expected !== stored?.updateTime)) return Response.json({ error: { status: "FAILED_PRECONDITION" } }, { status: 400 });
      const result = { ...JSON.parse(init.body), updateTime: `version-${++serial}` };
      documents.set(key, result);
      return Response.json(result);
    }
    return stored ? Response.json(stored) : new Response(null, { status: 404 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it("allows only one concurrent owner, then permits a later operation", async () => {
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const first = withFirestoreLease("workspace-security", async () => { entered(); await new Promise<void>(resolve => { finish = resolve; }); });
  await started;
  const second = vi.fn();
  await expect(withFirestoreLease("workspace-security", second)).rejects.toThrow("OPERATION_BUSY");
  expect(second).not.toHaveBeenCalled();
  finish(); await first;
  await expect(withFirestoreLease("workspace-security", async () => "ok")).resolves.toBe("ok");
});

it("releases the lease when the operation fails", async () => {
  await expect(withFirestoreLease("workflow-w1", async () => { throw new Error("failed"); })).rejects.toThrow("failed");
  await expect(withFirestoreLease("workflow-w1", async () => "ok")).resolves.toBe("ok");
});

it("atomically rejects one of two acquisitions that both observed an absent document", async () => {
  const operation = vi.fn(async () => "ok");
  const results = await Promise.allSettled([withFirestoreLease("race", operation), withFirestoreLease("race", operation)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect(operation).toHaveBeenCalledTimes(1);
});

it("recovers an expired lease and prevents its previous owner from releasing the new one", async () => {
  vi.useFakeTimers();
  let finishOld!: () => void;
  let oldAssert!: () => void;
  let enteredOld!: () => void;
  const oldStarted = new Promise<void>(resolve => { enteredOld = resolve; });
  const old = withFirestoreLease("workspace-security", async assertActive => { oldAssert = assertActive; enteredOld(); await new Promise<void>(resolve => { finishOld = resolve; }); });
  await oldStarted;
  vi.setSystemTime(Date.now() + 601_000);
  expect(() => oldAssert()).toThrow("OPERATION_LEASE_EXPIRED");
  let finishNew!: () => void;
  let enteredNew!: () => void;
  const newStarted = new Promise<void>(resolve => { enteredNew = resolve; });
  const newer = withFirestoreLease("workspace-security", async () => { enteredNew(); await new Promise<void>(resolve => { finishNew = resolve; }); });
  await newStarted;
  finishOld(); await old;
  await expect(withFirestoreLease("workspace-security", async () => {})).rejects.toThrow("OPERATION_BUSY");
  finishNew(); await newer;
});
