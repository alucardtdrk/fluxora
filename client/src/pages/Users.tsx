import { useMemo, useRef, useState } from "react";
import { ShieldCheck, UserPlus, Users as UsersIcon, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import OperationsShell from "@/components/OperationsShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

type Role = "admin" | "operator" | "viewer";
const roleLabel: Record<Role, string> = { admin: "Administrador", operator: "Operador", viewer: "Visualizador" };

export default function Users() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();
  const users = trpc.admin.users.useQuery(undefined, { retry: false });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [search, setSearch] = useState("");
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removedEmail = useRef<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const save = trpc.admin.saveUser.useMutation({
    onSuccess: async () => { toast.success("Acesso atualizado"); setEmail(""); setName(""); setRole("viewer"); await utils.admin.users.invalidate(); },
    onError: (error) => toast.error("Não foi possível salvar", { description: error.message }),
  });
  const setActive = trpc.admin.setUserActive.useMutation({
    onSuccess: async () => { toast.success("Status de acesso atualizado"); await utils.admin.users.invalidate(); },
    onError: (error) => toast.error("Não foi possível alterar o acesso", { description: error.message }),
  });
  const remove = trpc.admin.deleteUser.useMutation({
    onSuccess: async (_result, variables) => { removedEmail.current = variables.email; setRemovingEmail(null); setRemoveError(null); toast.success("Acesso removido"); await utils.admin.users.invalidate(); },
    onError: (error) => { setRemoveError("Não foi possível remover este acesso. Tente novamente."); toast.error("Não foi possível remover", { description: error.message }); },
  });

  const filtered = useMemo(() => (users.data ?? []).filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(search.toLowerCase())), [users.data, search]);

  return <OperationsShell><div className="mx-auto max-w-[1180px] px-5 py-8 md:px-9">
    <p className="text-[11px] font-bold uppercase tracking-[.18em] text-muted-foreground">Gestão / Acessos</p>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-4xl font-semibold tracking-[-.05em]">Usuários e permissões</h2><p className="mt-2 text-sm text-muted-foreground">Defina quem pode acessar o Fluxora e qual nível de permissão cada pessoa possui.</p></div><div className="rounded-full bg-feedback-info-surface px-3 py-1.5 text-xs font-semibold text-feedback-info">{users.data ? `${users.data.filter((item) => item.active).length} acessos ativos` : users.isLoading ? "Carregando acessos…" : "Acessos indisponíveis"}</div></div>

    <div className="mt-7 grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="border-0"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-4 w-4"/>Adicionar acesso</CardTitle></CardHeader><CardContent className="space-y-4">
        <div><Label htmlFor="access-name">Nome</Label><Input id="access-name" className="mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do colaborador"/></div>
        <div><Label htmlFor="access-email">E-mail corporativo</Label><Input id="access-email" className="mt-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@saipos.com" type="email"/></div>
        <div><Label htmlFor="access-role">Perfil</Label><Select value={role} onValueChange={(value) => setRole(value as Role)}><SelectTrigger id="access-role" className="mt-2"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="viewer">Visualizador</SelectItem><SelectItem value="operator">Operador</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent></Select></div>
        <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={!email || save.isPending} onClick={() => save.mutate({ email, name: name || undefined, role, active: true })}>Liberar acesso</Button>
        <div className="rounded-xl bg-background p-4 text-xs leading-5 text-muted-foreground"><b className="text-foreground">Perfis:</b><br/>Visualizador: somente leitura.<br/>Operador: leitura e ações operacionais de workflows.<br/>Administrador: acesso completo, configurações e usuários.</div>
      </CardContent></Card>

      <Card className="border-0"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-base"><UsersIcon className="h-4 w-4"/>Pessoas autorizadas</CardTitle><Input ref={searchInput} aria-label="Buscar usuários por nome ou e-mail" className="max-w-[280px]" placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)}/></div></CardHeader><CardContent className="p-0">
        {users.isLoading && <p role="status" className="px-6 py-12 text-center text-sm text-muted-foreground">Carregando usuários…</p>}
        {users.isError && <div role="alert" className="mx-6 mb-4 rounded-xl border border-feedback-error-border bg-feedback-error-surface p-4 text-sm text-feedback-error"><p>Não foi possível carregar os usuários.</p>{users.data && <p className="mt-1 text-xs">A lista anterior foi mantida e pode estar desatualizada.</p>}<Button variant="outline" size="sm" className="mt-3" disabled={users.isFetching} onClick={() => void users.refetch()}>Tentar novamente</Button></div>}
        <div className="divide-y divide-border">{filtered.map((item) => {
          const isSelf = currentUser?.email === item.email;
          const changingAccess = setActive.isPending && setActive.variables?.email === item.email;
          return <div key={item.email} className="grid gap-4 px-6 py-4 md:grid-cols-[1.5fr_170px_110px_42px] md:items-center">
            <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{item.name}</p>{item.role === "admin" && <ShieldCheck className="h-4 w-4 text-feedback-info"/>}</div><p className="truncate text-xs text-muted-foreground">{item.email}</p><p className="mt-1 text-[11px] text-muted-foreground">Último acesso: {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString("pt-BR") : "ainda não acessou"}</p></div>
            <Select value={item.role} disabled={isSelf && item.role === "admin"} onValueChange={(value) => save.mutate({ email: item.email, name: item.name, role: value as Role, active: item.active })}><SelectTrigger><SelectValue>{roleLabel[item.role as Role]}</SelectValue></SelectTrigger><SelectContent><SelectItem value="viewer">Visualizador</SelectItem><SelectItem value="operator">Operador</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent></Select>
            <div className="flex items-center gap-2"><Switch checked={item.active} aria-label={`Acesso de ${item.name || item.email}`} aria-busy={changingAccess} disabled={isSelf || setActive.isPending || users.isFetching} onCheckedChange={(active) => setActive.mutate({ email: item.email, active })}/><span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">{changingAccess && <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin" />}{changingAccess ? "Salvando…" : item.active ? "Ativo" : "Bloqueado"}</span></div>
            <AlertDialog open={removingEmail === item.email} onOpenChange={(open) => { if (remove.isPending) return; setRemovingEmail(open ? item.email : null); setRemoveError(null); }}>
              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isSelf || remove.isPending} aria-label={`Remover acesso de ${item.name || item.email}`}><Trash2 aria-hidden="true" className="h-4 w-4 text-muted-foreground"/></Button></AlertDialogTrigger>
              <AlertDialogContent onEscapeKeyDown={(event) => { if (remove.isPending) event.preventDefault(); }} onCloseAutoFocus={(event) => { if (removedEmail.current === item.email) { event.preventDefault(); searchInput.current?.focus(); removedEmail.current = null; } }}>
                <AlertDialogHeader>
                  <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-feedback-error-surface text-feedback-error"><Trash2 aria-hidden="true" className="size-5" /></div>
                  <AlertDialogTitle>Remover acesso ao Fluxora?</AlertDialogTitle>
                  <AlertDialogDescription>Você está removendo o acesso de <strong className="font-semibold text-foreground">{item.name || item.email}</strong> ({item.email}). Essa pessoa deixará de acessar o Fluxora. A conta do Google Workspace não será excluída.</AlertDialogDescription>
                </AlertDialogHeader>
                {removeError && <p role="alert" className="rounded-lg bg-feedback-error-surface p-3 text-sm text-feedback-error">{removeError}</p>}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction disabled={remove.isPending} aria-busy={remove.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); if (remove.isPending) return; setRemoveError(null); remove.mutate({ email: item.email }); }}>{remove.isPending && <RefreshCw aria-hidden="true" className="mr-2 size-4 animate-spin" />}{remove.isPending ? "Removendo…" : "Remover acesso"}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>;
        })}{!users.isLoading && !users.isError && filtered.length === 0 && <div className="px-6 py-12 text-center text-sm text-muted-foreground">{search.trim() ? "Nenhum usuário corresponde à busca." : "Nenhum usuário encontrado."}</div>}</div>
      </CardContent></Card>
    </div>
  </div></OperationsShell>;
}
