import { expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

it.each(["investigating", "resolved"] as const)("rejects viewer incident changes to %s", async (status) => {
  const caller = appRouter.createCaller({
    user: { id: 1, name: "Viewer", email: "viewer@example.com", role: "viewer" },
    req: {} as TrpcContext["req"], res: {} as TrpcContext["res"],
  });
  await expect(caller.n8n.updateIncident({ fingerprint: "incident", status, severity: "medium", owner: "viewer@example.com", note: "Checked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
