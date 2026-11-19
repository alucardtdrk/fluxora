import { BRAZIL_TIME_ZONE } from "@shared/timezone";

type Telemetry = {
  status: string;
  connected?: boolean;
  collectedAt?: string | null;
  archiveSyncedAt?: string | null;
  archiveUnavailable?: boolean;
  truncated?: boolean;
};

export function isTelemetryStale(data: Telemetry | undefined, maxAgeMs: number) {
  const collectedAt = Date.parse(data?.collectedAt || "");
  const archiveSyncedAt = Date.parse(data?.archiveSyncedAt || "");
  return !data || data.status !== "ok" || data.connected === false || Boolean(data.truncated || data.archiveUnavailable)
    || !Number.isFinite(collectedAt) || Date.now() - collectedAt > maxAgeMs
    || (data.archiveSyncedAt !== undefined && (!Number.isFinite(archiveSyncedAt) || Date.now() - archiveSyncedAt > 36 * 3600_000));
}

export default function TelemetryStatus({ data, error, placeholder, loading, maxAgeMs }: { data?: Telemetry; error?: boolean; placeholder?: boolean; loading?: boolean; maxAgeMs: number }) {
  if (loading && !data) return null;
  const failed = error || !data || data.status !== "ok" || data.connected === false;
  const format = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("pt-BR", { timeZone: BRAZIL_TIME_ZONE }) : "indisponível";
  return <div className="mb-5 space-y-2 text-sm" role="status" aria-live="polite">
    {failed && <p className="text-feedback-error">Não foi possível atualizar os dados. Os valores disponíveis podem ser de uma consulta anterior.</p>}
    {placeholder && <p className="text-muted-foreground">Aplicando os filtros. Os dados anteriores ainda não correspondem à seleção atual.</p>}
    {(data?.truncated || data?.archiveUnavailable) && <p className="text-feedback-error">Dados incompletos. Não foi possível confirmar todos os registros do período.</p>}
    {!failed && !placeholder && isTelemetryStale(data, maxAgeMs) && <p className="text-feedback-error">Dados desatualizados ou sem data de coleta confirmada.</p>}
    {data?.status === "ok" && <p className="text-muted-foreground">Última coleta no n8n: {format(data.collectedAt)}</p>}
    {data?.archiveSyncedAt !== undefined && <p className="text-muted-foreground">Última preservação do histórico: {format(data.archiveSyncedAt)}</p>}
  </div>;
}
