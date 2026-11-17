import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Users from "./Users";
import { toast } from "sonner";

const state = vi.hoisted(() => ({
  mutation: { isPending: false, mutate: vi.fn() }, callbacks: {} as any,
  action: {} as any, content: {} as any, invalidate: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { email: "admin@example.com", role: "admin" } }) }));
vi.mock("@/components/OperationsShell", () => ({ default: ({ children }: any) => children }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ admin: { users: { invalidate: state.invalidate } } }),
  admin: {
    users: { useQuery: () => ({ data: [{ name: "Ana", email: "ana@example.com", role: "viewer", active: true }] }) },
    saveUser: { useMutation: () => ({}) }, setUserActive: { useMutation: () => ({}) },
    deleteUser: { useMutation: (options: any) => { state.callbacks = options; return state.mutation; } },
  },
} }));
vi.mock("@/components/ui/alert-dialog", () => {
  const wrapper = ({ children }: any) => React.createElement("div", null, children);
  return {
    AlertDialog: wrapper, AlertDialogTrigger: wrapper, AlertDialogHeader: wrapper, AlertDialogFooter: wrapper,
    AlertDialogTitle: wrapper, AlertDialogDescription: wrapper,
    AlertDialogContent: (props: any) => { state.content = props; return wrapper(props); },
    AlertDialogCancel: ({ children, disabled }: any) => React.createElement("button", { disabled }, children),
    AlertDialogAction: (props: any) => { state.action = props; return React.createElement("button", { disabled: props.disabled }, props.children); },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => { vi.stubGlobal("React", React); state.mutation.isPending = false; vi.clearAllMocks(); });
afterEach(() => vi.unstubAllGlobals());

it("identifies the user and explains the scope without removing access on open", () => {
  const html = renderToStaticMarkup(React.createElement(Users));
  expect(html).toContain('aria-label="Remover acesso de Ana"');
  expect(html).toContain("ana@example.com");
  expect(html).toContain("A conta do Google Workspace não será excluída");
  expect(state.mutation.mutate).not.toHaveBeenCalled();
});
it("keeps confirmation open until the removal succeeds and targets the selected email", async () => {
  renderToStaticMarkup(React.createElement(Users));
  const event = { preventDefault: vi.fn() };
  state.action.onClick(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(state.mutation.mutate).toHaveBeenCalledOnce();
  expect(state.mutation.mutate).toHaveBeenCalledWith({ email: "ana@example.com" });
  await state.callbacks.onSuccess({ success: true }, { email: "ana@example.com" });
  expect(toast.success).toHaveBeenCalledWith("Acesso removido");
  expect(state.invalidate).toHaveBeenCalledOnce();
});
it("blocks repeated removal and Escape while the request is pending", () => {
  state.mutation.isPending = true;
  const html = renderToStaticMarkup(React.createElement(Users));
  expect(html).toContain("Removendo…");
  expect(state.action.disabled).toBe(true);
  state.action.onClick({ preventDefault: vi.fn() });
  expect(state.mutation.mutate).not.toHaveBeenCalled();
  const event = { preventDefault: vi.fn() };
  state.content.onEscapeKeyDown(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
});
it("reports removal failure without invalidating the list or reporting success", () => {
  renderToStaticMarkup(React.createElement(Users));
  state.callbacks.onError(new Error("offline"));
  expect(toast.error).toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  expect(state.invalidate).not.toHaveBeenCalled();
});
it("allows Escape when no request is pending", () => {
  renderToStaticMarkup(React.createElement(Users));
  const event = { preventDefault: vi.fn() };
  state.content.onEscapeKeyDown(event);
  expect(event.preventDefault).not.toHaveBeenCalled();
});
