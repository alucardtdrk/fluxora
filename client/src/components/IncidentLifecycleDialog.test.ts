import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import IncidentLifecycleDialog from "./IncidentLifecycleDialog";

const auth = vi.hoisted(() => ({ role: "viewer" }));
vi.stubGlobal("React", React);
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { role: auth.role, email: "user@example.com" } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({}), n8n: { updateIncident: { useMutation: () => ({ isPending: false }) } } } }));
vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: any) => createElement("div", null, children);
  return { useDialogComposition: () => null, ...Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map((key) => [key, Wrapper])) };
});

describe("incident permissions", () => {
  it.each(["viewer", "operator", "admin"])("renders incident controls for %s", (role) => {
    auth.role = role;
    const html = renderToStaticMarkup(createElement(IncidentLifecycleDialog, {
      incident: { fingerprint: "incident", automation: "Workflow", workflowName: "Workflow", cause: "Failure", count: 1, executionId: "1", lifecycle: { status: "new", severity: "medium" } },
      open: true, onOpenChange: () => {}, onOpenExecution: () => {},
    }));
    expect(html).toContain("Abrir execução");
    for (const action of ["Assumir", "Salvar incidente", "Silenciar por 24h"]) {
      if (role === "viewer") expect(html).not.toContain(action);
      else expect(html).toContain(action);
    }
    if (role === "viewer") expect(html).toContain('disabled=""');
  });
});
