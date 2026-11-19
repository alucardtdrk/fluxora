import { formatCustomPeriod, type PresetPeriod } from "@shared/dashboardPeriod";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowRightLeft, BarChart3, CalendarDays, CheckCircle2, Clock3, Eye, Gauge, Play, RefreshCw, Target, Timer, TrendingUp, Workflow, XCircle, type LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import OperationsShell from "@/components/OperationsShell";
import { MetricSkeleton } from "@/components/MetricSkeleton";
import TelemetryStatus, { isTelemetryStale } from "@/components/TelemetryStatus";
import ExecutionDetailDialog from "@/components/ExecutionDetailDialog";
import IncidentAttentionCenter from "@/components/IncidentAttentionCenter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PeriodFilter from "@/components/PeriodFilter";
import { PREFERENCES_UPDATED_EVENT, readPreferredPageSize, readPreferredRefreshSeconds, readScopedPeriod, saveScopedPeriod, type DashboardPeriod } from "@/lib/preferences";
import { trpc } from "@/lib/trpc";

type Period = DashboardPeriod;
const periodLabels: Record<PresetPeriod, string> = { today: "Hoje", "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", all: "Todo o histórico" };

export default function Insights() {
  return <AnalyticsPage />;
}

export function ErrorsInsights() {
  return <ErrorsPage />;
}

function Header({ title, description, period, setPeriod, refresh, loading }: { title: string; description: string; period: Period; setPeriod: (period: Period) => void; refresh: () => void; loading: boolean }) {
  return (
    <>
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" />Voltar para visão geral</Link>
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-muted-foreground">Monitoramento</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-.06em]">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} options={(Object.keys(periodLabels) as PresetPeriod[]).map((value) => [value, periodLabels[value]] as const)} onChange={setPeriod} />
          <Button onClick={refresh} disabled={loading} aria-busy={loading} className="rounded-xl bg-primary text-primary-foreground"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Atualizando…" : "Atualizar"}</Button>
        </div>
      </div>
    </>
  );
}

type PeriodComparison = {
  executionsDelta: number | null;
  errorsDelta: number | null;
  successRateDelta: number | null;
  previous: { total: number; errors: number; successRate: number | null; startDate: string | null; endDate: string | null };
  recent: { total: number; errors: number; successRate: number | null; startDate: string | null; endDate: string | null };
};

function AnalyticsAlerts({ comparison }: { comparison?: PeriodComparison | null }) {
  if (!comparison) return null;
  const alerts = [
    comparison.errorsDelta !== null && comparison.errorsDelta >= 50 ? "As falhas cresceram 50% ou mais na metade mais recente do período." : null,
    comparison.successRateDelta !== null && comparison.successRateDelta <= -5 ? "A taxa de sucesso caiu 5 pontos percentuais ou mais na metade mais recente." : null,
  ].filter((alert): alert is string => Boolean(alert));
  if (!alerts.length) return null;
  return <Card className="mb-6 border border-feedback-error-border bg-feedback-error-surface shadow-sm"><CardContent className="flex gap-3 p-5"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-feedback-error" /><div><p className="text-sm font-semibold text-foreground">Atenção operacional</p><ul className="mt-2 space-y-1 text-xs leading-5 text-feedback-error">{alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul></div></CardContent></Card>;
}

function ComparisonStrip({ comparison, loading }: { comparison?: PeriodComparison | null; loading: boolean }) {
  if (!loading && !comparison) return null;
  const date = (value: string) => value.split("-").reverse().join("/");
  const range = (part: PeriodComparison["previous"] | undefined) => part?.startDate && part.endDate ? `${date(part.startDate)} a ${date(part.endDate)}` : "Datas indisponíveis";
  const number = (value: number | null | undefined, rate = false) => value == null ? "Sem base" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: rate ? 4 : 0 })}${rate ? "%" : ""}`;
  const metrics = [
    { title: "Execuções", icon: BarChart3, delta: comparison?.executionsDelta, previous: comparison?.previous.total, recent: comparison?.recent.total, rate: false, neutral: true, inverse: false },
    { title: "Falhas", icon: XCircle, delta: comparison?.errorsDelta, previous: comparison?.previous.errors, recent: comparison?.recent.errors, rate: false, neutral: false, inverse: false },
    { title: "Taxa de sucesso", icon: CheckCircle2, delta: comparison?.successRateDelta, previous: comparison?.previous.successRate, recent: comparison?.recent.successRate, rate: true, neutral: false, inverse: true },
  ];
  return (
    <Card className="mb-6 overflow-hidden border-0 bg-card shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-feedback-info-surface text-feedback-info"><ArrowRightLeft className="size-4" aria-hidden="true" /></span><div><h3 className="text-base font-semibold">Evolução dentro do período</h3><p className="mt-1 text-xs text-muted-foreground">Parte mais recente em relação à primeira parte do intervalo selecionado.</p></div></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden="true" />Mesmo período selecionado</span>
        </div>
        <div className="my-5 grid items-center gap-3 rounded-2xl border border-border bg-background/50 p-3 sm:grid-cols-[1fr_auto_1fr]">
          {["Primeira parte", "Parte mais recente"].map((label, index) => <div key={label} className={`rounded-xl px-3 py-2 ${index ? "bg-feedback-info-surface" : ""} ${index ? "sm:col-start-3 sm:row-start-1" : ""}`}><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{loading ? "Carregando…" : range(index ? comparison?.recent : comparison?.previous)}</p></div>)}
          <ArrowRight className="hidden size-4 text-muted-foreground sm:col-start-2 sm:row-start-1 sm:block" aria-hidden="true" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {metrics.map(({ title, icon: Icon, delta, previous, recent, rate, neutral, inverse }) => {
            const tone = delta == null || delta === 0 ? "bg-muted text-muted-foreground" : neutral ? "bg-feedback-info-surface text-feedback-info" : (delta > 0) !== inverse ? "bg-feedback-error-surface text-feedback-error" : "bg-feedback-success-surface text-feedback-success";
            return <div key={title} className="min-w-0 rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-feedback-info" aria-hidden="true" />{title}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${tone}`}>{loading ? "…" : delta == null ? "Sem base" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR")}${rate ? " p.p." : "%"}`}</span></div>
              {loading ? <MetricSkeleton /> : <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><div><p className="text-xl font-semibold tabular-nums">{number(previous, rate)}</p><p className="mt-1 text-[11px] text-muted-foreground">Primeira parte</p></div><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /><div className="text-right"><p className="text-xl font-semibold tabular-nums">{number(recent, rate)}</p><p className="mt-1 text-[11px] text-muted-foreground">Mais recente</p></div></div>}
            </div>;
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">p.p. = pontos percentuais.</p>
      </CardContent>
    </Card>
  );
}

function AnalyticsPage() {
  const { user } = useAuth();
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(() => readPreferredRefreshSeconds() * 1000);
  const [period, setPeriod] = useState<Period>(() => readScopedPeriod("analytics"));
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const data = trpc.n8n.analytics.useQuery({ period }, { enabled: Boolean(user), retry: false, placeholderData: (previous) => previous, refetchInterval: period === "today" ? refreshIntervalMs : Math.max(refreshIntervalMs, 60_000) });
  const dashboard = data.data;
  const initialLoading = data.isPending && !data.data;
  const rankedWorkflows = (dashboard?.workflowStats ?? []).filter((workflow) => workflow.executions > 0).sort((a, b) => b.executions - a.executions);
  const totalWorkflowExecutions = rankedWorkflows.reduce((total, workflow) => total + workflow.executions, 0);
  const [selectedVolumeWorkflow, setSelectedVolumeWorkflow] = useState<string | null>(null);
  const topVolumeWorkflows = rankedWorkflows.slice(0, 8);
  const highlightedWorkflow = topVolumeWorkflows.find((workflow) => workflow.id === selectedVolumeWorkflow) ?? topVolumeWorkflows[0];

  const maxAgeMs = Math.max(refreshIntervalMs, 60_000) * 2;
  const refresh = async () => {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      await utils.n8n.analytics.cancel({ period });
      const result = await utils.n8n.analytics.fetch({ period, forceRefresh: true }, { staleTime: 0 });
      utils.n8n.analytics.setData({ period }, result);
      if (!result.summary || isTelemetryStale(result, maxAgeMs)) {
        toast.error("Não foi possível atualizar o Analytics com dados completos e recentes.");
        return;
      }
      toast.success("Analytics atualizado");
    } catch {
      setRefreshFailed(true);
      toast.error("Não foi possível atualizar o Analytics. Tente novamente.");
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => setRefreshFailed(false), [dashboard?.collectedAt, period]);
  useEffect(() => saveScopedPeriod("analytics", period), [period]);
  useEffect(() => {
    const syncPreferences = () => {
      setRefreshIntervalMs(readPreferredRefreshSeconds() * 1000);
      setPeriod(readScopedPeriod("analytics"));
    };
    window.addEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences);
    return () => window.removeEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences);
  }, []);

  return (
    <OperationsShell>
      <div className="min-h-[calc(100vh-86px)] bg-background px-5 py-7 md:px-9">
        <div className="mx-auto max-w-[1450px]">
          <AnalyticsAlerts comparison={dashboard?.comparison} />
          <Header title="Analytics" description="Tendências reais de volume, sucesso, duração e desempenho por workflow." period={period} setPeriod={setPeriod} refresh={refresh} loading={data.isFetching || refreshing} />
          <TelemetryStatus data={dashboard} error={refreshFailed || data.isError} placeholder={data.isPlaceholderData} loading={initialLoading} maxAgeMs={maxAgeMs} />
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Metric icon={Play} title="Execuções" value={dashboard?.summary ? String(dashboard.summary.executions) : "—"} loading={initialLoading} />
            <Metric icon={CheckCircle2} title="Taxa de sucesso" value={dashboard?.summary?.successRate != null ? `${dashboard.summary.successRate}%` : "—"} loading={initialLoading} />
            <Metric icon={XCircle} title="Falhas" value={dashboard?.summary ? String(dashboard.summary.errors) : "—"} loading={initialLoading} />
            <Metric icon={Timer} title="Duração média" value={dashboard?.summary?.averageDuration != null ? `${dashboard.summary.averageDuration}s` : "—"} loading={initialLoading} />
            <Metric icon={Clock3} title="50% concluídas em até" value={dashboard?.summary?.p50Duration != null ? `${dashboard.summary.p50Duration}s` : "—"} loading={initialLoading} />
            <Metric icon={Gauge} title="95% concluídas em até" value={dashboard?.summary?.p95Duration != null ? `${dashboard.summary.p95Duration}s` : "—"} loading={initialLoading} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card className="border-0 bg-card shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-feedback-info" />Tendência de execuções</CardTitle>{period.startsWith("custom:") && <p className="text-xs text-muted-foreground">Até 90 dias: diário. Até um ano: semanal. Acima de um ano: mensal. Cada ponto indica o intervalo somado.</p>}</CardHeader>
              <CardContent><div className="h-[300px]">{(dashboard?.trend?.length ?? 0) > 0 ? <ResponsiveContainer width="100%" height="100%"><AreaChart accessibilityLayer data={dashboard?.trend} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="analytics-total-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--feedback-info)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="var(--feedback-info)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="analytics-success-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--feedback-success)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--feedback-success)" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="analytics-error-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--feedback-error)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--feedback-error)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" strokeOpacity={0.6} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip cursor={false} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", padding: "12px 16px", boxShadow: "0 8px 24px rgb(0 0 0 / 0.15)" }} labelStyle={{ color: "var(--foreground)", fontWeight: 600, borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 8 }} itemStyle={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }} formatter={(value, name) => [Number(value).toLocaleString("pt-BR"), name]} />
              <Area name="Total" dataKey="total" type="monotone" stroke="var(--feedback-info)" strokeWidth={2} fill="url(#analytics-total-gradient)" />
              <Area name="Sucesso" dataKey="success" type="monotone" stroke="var(--feedback-success)" strokeWidth={2} fill="url(#analytics-success-gradient)" />
              <Area name="Erros" dataKey="errors" type="monotone" stroke="var(--feedback-error)" strokeWidth={2} fill="url(#analytics-error-gradient)" />
            </AreaChart></ResponsiveContainer> : <Empty text={initialLoading ? "Carregando telemetria..." : dashboard?.truncated && period.startsWith("custom:") ? "Consulta incompleta. O gráfico será exibido quando todo o período estiver disponível." : "Sem dados no período"} />}</div></CardContent>
            </Card>
            <Card className="overflow-hidden border border-violet-500/20 bg-card shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-3 text-base"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white"><TrendingUp className="size-4" aria-hidden="true" /></span>Top workflows por volume</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {initialLoading ? <div className="h-64 animate-pulse rounded-xl bg-muted" aria-label="Carregando volumes" /> : <>
                  <dl className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Execuções no período</dt><dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{dashboard?.summary ? totalWorkflowExecutions.toLocaleString("pt-BR") : "—"}</dd></div>
                    <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Workflows com execuções</dt><dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{dashboard?.summary ? rankedWorkflows.length.toLocaleString("pt-BR") : "—"}</dd></div>
                  </dl>
                  {highlightedWorkflow ? <>
                    <div className="rounded-xl bg-muted/40 px-3 pb-2 pt-3">
                      <div className="grid h-28 items-end gap-2" style={{ gridTemplateColumns: `repeat(${topVolumeWorkflows.length}, minmax(0, 1fr))` }} aria-label="Volumes dos principais workflows">
                        {topVolumeWorkflows.map((workflow, index) => <button key={workflow.id} type="button" aria-pressed={highlightedWorkflow.id === workflow.id} aria-label={`${workflow.name}: ${workflow.executions.toLocaleString("pt-BR")} execuções. Mostrar detalhes.`} onClick={() => setSelectedVolumeWorkflow(workflow.id)} onFocus={() => setSelectedVolumeWorkflow(workflow.id)} onMouseEnter={() => setSelectedVolumeWorkflow(workflow.id)} className="group/bar flex h-full min-w-0 flex-col items-center justify-end gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{workflow.executions.toLocaleString("pt-BR")}</span>
                          <span className={`block w-full max-w-10 rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-500 transition-opacity motion-reduce:transition-none ${highlightedWorkflow.id === workflow.id ? "opacity-100" : "opacity-45 group-hover/bar:opacity-100"}`} style={{ height: `${workflow.executions / topVolumeWorkflows[0]!.executions * 76}%` }} />
                          <span className="text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
                        </button>)}
                      </div>
                    </div>
                    <div className="min-h-16" aria-live="polite">
                      <Link href={`/workflows/${encodeURIComponent(highlightedWorkflow.id)}`} className="block break-words text-sm font-semibold hover:text-primary hover:underline">{highlightedWorkflow.name}</Link>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>{(highlightedWorkflow.executions / totalWorkflowExecutions * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do volume</span><span>{highlightedWorkflow.successRate != null ? `${highlightedWorkflow.successRate.toLocaleString("pt-BR")}% de sucesso` : "Sucesso indisponível"}</span><span className={highlightedWorkflow.errors > 0 ? "font-medium text-feedback-error" : ""}>{highlightedWorkflow.errors.toLocaleString("pt-BR")} falha(s)</span></p>
                      <p className="mt-1 text-[10px] text-muted-foreground">Selecione uma barra para ver os detalhes.{rankedWorkflows.length > 8 ? " Exibindo os 8 maiores volumes." : ""}</p>
                    </div>
                  </> : <Empty text={dashboard?.summary ? "Nenhum workflow com execuções no período" : "Dados de workflows indisponíveis"} />}
                </>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><span className="text-xs text-muted-foreground">{period.startsWith("custom:") ? formatCustomPeriod(period) : periodLabels[period as PresetPeriod]}</span><Button asChild size="sm" className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500"><Link href="/workflows">Ver workflows <span aria-hidden="true">→</span></Link></Button></div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6"><ComparisonStrip comparison={dashboard?.comparison} loading={initialLoading} /></div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Metric icon={Target} title="Workflows com meta" value={dashboard?.sloSummary ? String(dashboard.sloSummary.configured) : "—"} loading={initialLoading} />
            <Metric icon={CheckCircle2} title="Dentro da meta" value={dashboard?.sloSummary ? String(dashboard.sloSummary.met) : "—"} loading={initialLoading} />
            <Metric icon={AlertTriangle} title="Fora da meta" value={dashboard?.sloSummary ? String(dashboard.sloSummary.breached) : "—"} loading={initialLoading} />
          </div>
          <SloBudgetPanel workflows={dashboard?.workflowStats ?? []} loading={initialLoading} />

          <Card className="border-0 bg-card shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-feedback-info" />Desempenho por workflow</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="hidden gap-4 border-t px-6 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground md:grid md:grid-cols-[minmax(250px,1.6fr)_repeat(6,minmax(85px,.45fr))]"><span>Workflow</span><span className="text-center">Execuções</span><span className="text-center">Erros</span><span className="text-center">Sucesso</span><span className="text-center">Tempo médio</span><span className="text-center">Tempo típico</span><span className="text-center">Tempo em execuções lentas</span></div>
              <div className="divide-y">{(dashboard?.workflowStats ?? []).map((workflow) => <div key={workflow.id} className="grid gap-3 px-6 py-4 md:grid-cols-[minmax(250px,1.6fr)_repeat(6,minmax(85px,.45fr))] md:items-center"><span className="text-sm font-semibold">{workflow.name}</span><span className="justify-self-center text-center text-xs text-muted-foreground">{workflow.executions}</span><span className="justify-self-center text-center text-xs text-feedback-error">{workflow.errors}</span><span className="justify-self-center text-center text-xs text-feedback-success">{workflow.successRate != null ? `${workflow.successRate}%` : "—"}</span><span className="justify-self-center text-center text-xs text-muted-foreground">{workflow.averageDuration != null ? `${workflow.averageDuration}s` : "—"}</span><span className="justify-self-center text-center text-xs text-muted-foreground">{workflow.p50Duration != null ? `${workflow.p50Duration}s` : "—"}</span><span className="justify-self-center text-center text-xs text-muted-foreground">{workflow.p95Duration != null ? `${workflow.p95Duration}s` : "—"}</span></div>)}</div>
            </CardContent>
          </Card>
          <NodeAnalytics dashboard={dashboard} loading={initialLoading} />
        </div>
      </div>
    </OperationsShell>
  );
}

function NodeAnalytics({ dashboard, loading }: { dashboard: any; loading: boolean }) {
  return <Card className="mt-6 border-0 bg-card shadow-sm">
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Timer className="h-4 w-4 text-feedback-info" />Desempenho por node</CardTitle><p className="text-xs text-muted-foreground">Baseado em {Number(dashboard?.nodeAnalyticsCoverage ?? 0).toLocaleString("pt-BR")} execuções com detalhes preservados.</p></CardHeader>
    <CardContent className="overflow-x-auto p-0">
      <div className="hidden min-w-[1180px] border-t px-6 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground md:grid md:grid-cols-[1.4fr_1.1fr_repeat(8,.55fr)]"><span>Node</span><span>Workflow</span><span className="text-center">Execuções</span><span className="text-center">Falhas</span><span className="text-center">Taxa de falha</span><span className="text-center">Tempo médio</span><span className="text-center">Tempo típico</span><span className="text-center">Execuções lentas</span><span className="text-center">Tempo do workflow</span><span className="text-center">Itens</span></div>
      <div className="divide-y">
        {(dashboard?.nodeStats ?? []).slice(0, 20).map((node: any) => (
          <div key={`${node.workflowId}-${node.nodeName}`} className="grid gap-2 px-6 py-4 text-xs md:min-w-[1180px] md:grid-cols-[1.4fr_1.1fr_repeat(8,.55fr)] md:items-center">
            <span className="font-semibold text-foreground">{node.nodeName}</span>
            <span className="truncate text-muted-foreground">{node.workflowName}</span>
            <span className="text-center">{node.runs}</span>
            <span className="text-center text-feedback-error">{node.errors}</span>
            <span className="text-center">{node.errorRate}%</span>
            <span className="text-center">{node.averageMs != null ? `${node.averageMs}ms` : "—"}</span>
            <span className="text-center">{node.p50Ms != null ? `${node.p50Ms}ms` : "—"}</span>
            <span className="text-center">{node.p95Ms != null ? `${node.p95Ms}ms` : "—"}</span>
            <span className="text-center">{node.workflowTimeShare}%</span>
            <span className="text-center">{Number(node.outputItems ?? 0).toLocaleString("pt-BR")}</span>
          </div>
        ))}
        {(dashboard?.nodeStats?.length ?? 0) === 0 ? <Empty text={loading ? "Calculando nodes..." : "Os dados aparecerão conforme os detalhes forem preservados"} /> : null}
      </div>
    </CardContent>
  </Card>;
}

function SloBudgetPanel({ workflows, loading }: { workflows: any[]; loading: boolean }) {
  const configured = workflows.filter((workflow) => workflow.slo?.enabled);
  if (!loading && configured.length === 0) return null;
  return <Card className="mb-6 border-0 bg-card shadow-sm"><CardHeader><CardTitle className="text-base">Margem de falhas por workflow</CardTitle><p className="text-xs text-muted-foreground">Mostra quantas falhas a meta ainda tolera no período selecionado.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{configured.map((workflow) => {
    const consumed = Number(workflow.errorBudget?.consumedPercent ?? 0);
    const breached = workflow.sloStatus === "breached";
    return <div key={workflow.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{workflow.name}</p><p className="mt-1 text-xs text-muted-foreground">Meta de {workflow.slo.successRateTarget}% de sucesso</p></div><Badge variant="outline" className={breached ? "border-feedback-error-border bg-feedback-error-surface text-feedback-error" : "border-border bg-feedback-success-surface text-feedback-success"}>{breached ? "Fora da meta" : "Dentro da meta"}</Badge></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${breached ? "bg-red-500" : consumed >= 75 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, consumed)}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{consumed.toLocaleString("pt-BR")}% da margem utilizada</span><span>{workflow.errorBudget?.remainingFailures ?? 0} falha(s) ainda tolerada(s)</span></div></div>;
  })}{loading ? <div className="h-28 animate-pulse rounded-xl bg-muted" /> : null}</CardContent></Card>;
}

function ErrorsPage() {
  const { user } = useAuth();
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(() => readPreferredRefreshSeconds() * 1000);
  const [period, setPeriod] = useState<Period>(() => readScopedPeriod("errors"));
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [errorPage, setErrorPage] = useState(1);
  const [errorPageSize, setErrorPageSize] = useState(() => readPreferredPageSize(50));
  const [selected, setSelected] = useState<string | null>(null);
  const data = trpc.n8n.analytics.useQuery({ period }, { enabled: Boolean(user), retry: false, placeholderData: (previous) => previous, refetchInterval: period === "today" ? refreshIntervalMs : Math.max(refreshIntervalMs, 60_000) });
  const dashboard = data.data;
  const initialLoading = data.isPending && !data.data;
  const recentErrors = dashboard?.recentErrors ?? [];
  const totalErrorPages = Math.max(1, Math.ceil(recentErrors.length / errorPageSize));
  const currentErrorPage = Math.min(errorPage, totalErrorPages);
  const visibleErrors = recentErrors.slice((currentErrorPage - 1) * errorPageSize, currentErrorPage * errorPageSize);
  const maxAgeMs = Math.max(refreshIntervalMs, 60_000) * 2;
  const refresh = async () => {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      await utils.n8n.analytics.cancel({ period });
      const result = await utils.n8n.analytics.fetch({ period, forceRefresh: true }, { staleTime: 0 });
      utils.n8n.analytics.setData({ period }, result);
      if (!result.summary || isTelemetryStale(result, maxAgeMs)) {
        toast.error("Não foi possível atualizar os erros com dados completos e recentes.");
        return;
      }
      toast.success("Erros atualizados");
    } catch {
      setRefreshFailed(true);
      toast.error("Não foi possível atualizar os erros. Tente novamente.");
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => setRefreshFailed(false), [dashboard?.collectedAt, period]);

  useEffect(() => saveScopedPeriod("errors", period), [period]);
  useEffect(() => {
    const syncPreferences = () => {
      setRefreshIntervalMs(readPreferredRefreshSeconds() * 1000);
      setPeriod(readScopedPeriod("errors"));
      setErrorPageSize(readPreferredPageSize(50));
      setErrorPage(1);
    };
    window.addEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences);
    return () => window.removeEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences);
  }, []);

  return (
    <OperationsShell>
      <div className="min-h-[calc(100vh-86px)] bg-background px-5 py-7 md:px-9">
        <div className="mx-auto max-w-[1450px]">
          <Header title="Erros" description="Falhas reais, workflows críticos e acesso direto ao detalhe técnico da execução." period={period} setPeriod={(value) => { setPeriod(value); setErrorPage(1); }} refresh={refresh} loading={data.isFetching || refreshing} />
          <TelemetryStatus data={dashboard} error={refreshFailed || data.isError} placeholder={data.isPlaceholderData} loading={initialLoading} maxAgeMs={maxAgeMs} />
          <div className="grid gap-4 md:grid-cols-3"><Metric icon={XCircle} title="Falhas no período" value={dashboard?.summary ? String(dashboard.summary.errors) : "—"} loading={initialLoading} /><Metric icon={CheckCircle2} title="Taxa de sucesso" value={dashboard?.summary?.successRate != null ? `${dashboard.summary.successRate}%` : "—"} loading={initialLoading} /><Metric icon={Workflow} title="Workflows com falha" value={dashboard?.summary ? String((dashboard.workflowStats ?? []).filter((workflow) => workflow.errors > 0).length) : "—"} loading={initialLoading} /></div>
          <IncidentAttentionCenter incidents={(dashboard?.incidentGroups ?? []) as any[]} loading={initialLoading} />
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card className="border-0 bg-card shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-feedback-error" />Falhas recentes</CardTitle>{dashboard?.summary && dashboard.summary.errors > recentErrors.length && <p className="text-xs text-muted-foreground">Lista limitada às {recentErrors.length} falhas mais recentes. O agrupamento considera todas as {dashboard.summary.errors} falhas do período.</p>}</CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">{visibleErrors.map((error) => <div key={error.id} className="grid gap-3 px-6 py-4 md:grid-cols-[1.5fr_.8fr_.5fr_auto] md:items-center"><div><p className="text-sm font-semibold">{error.sectionName || error.workflowName}</p><p className="mt-1 text-xs text-muted-foreground">Workflow: {error.workflowName} · #{error.id} · {error.startedAt ? new Date(error.startedAt).toLocaleString("pt-BR") : "—"}</p></div><Badge className="w-fit bg-feedback-error-surface text-feedback-error">Erro</Badge><span className="text-xs text-muted-foreground">{error.duration != null ? `${error.duration}s` : "—"}</span><Button variant="outline" size="sm" onClick={() => setSelected(error.id)}><Eye className="mr-2 h-3.5 w-3.5" />Ver detalhes</Button></div>)}{recentErrors.length === 0 && <Empty text={initialLoading ? "Carregando falhas..." : dashboard?.summary ? "Nenhuma falha neste período" : "Não foi possível consultar as falhas"} />}</div>
                {recentErrors.length > 0 ? <div className="flex flex-col gap-3 border-t px-6 py-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between"><span>Mostrando {(currentErrorPage - 1) * errorPageSize + 1}-{Math.min(currentErrorPage * errorPageSize, recentErrors.length)} de {recentErrors.length} falhas</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentErrorPage <= 1} onClick={() => setErrorPage((value) => Math.max(1, value - 1))}>Anterior</Button><span>Página {currentErrorPage} de {totalErrorPages}</span><Button variant="outline" size="sm" disabled={currentErrorPage >= totalErrorPages} onClick={() => setErrorPage((value) => Math.min(totalErrorPages, value + 1))}>Próxima</Button></div></div> : null}
              </CardContent>
            </Card>
            <Card className="border-0 bg-card shadow-sm"><CardHeader><CardTitle className="text-base">Workflows críticos</CardTitle></CardHeader><CardContent className="space-y-3">{(dashboard?.workflowStats ?? []).filter((workflow) => workflow.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 10).map((workflow, index) => <div key={workflow.id} className="rounded-xl bg-background p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{index + 1}. {workflow.name}</p><Badge className="bg-feedback-error-surface text-feedback-error">{workflow.errors} erros</Badge></div><div className="mt-2 flex gap-4 text-xs text-muted-foreground"><span>{workflow.executions} execuções</span><span>{workflow.successRate ?? 0}% sucesso</span></div></div>)}</CardContent></Card>
          </div>
        </div>
      </div>
      <ExecutionDetailDialog executionId={selected} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} />
    </OperationsShell>
  );
}

function Metric({ title, value, icon: Icon, loading = false }: { title: string; value: string; icon: LucideIcon; loading?: boolean }) {
  return <Card className="min-w-0 border-0 bg-card shadow-sm"><CardContent className="p-5"><div className="flex justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{title}</p>{loading ? <MetricSkeleton className="max-w-full" /> : <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>}</div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-feedback-info-surface text-feedback-info"><Icon className="h-4 w-4" aria-hidden="true" /></span></div></CardContent></Card>;
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">{text}</div>;
}
