import { useId, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { DashboardPeriod } from "@/lib/preferences";
import { customPeriodBounds, formatCustomPeriod } from "@shared/dashboardPeriod";
import { brazilDateKey } from "@shared/timezone";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function PeriodFilter({ value, options, onChange, className = "" }: {
  value: DashboardPeriod;
  options: readonly (readonly [DashboardPeriod, string])[];
  onChange: (value: DashboardPeriod) => void;
  className?: string;
}) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const next: DashboardPeriod = `custom:${startDate}:${endDate}`;
  const validRange = customPeriodBounds(next);
  const custom = customPeriodBounds(value);
  return <LayoutGroup id={id}>
    <div role="group" aria-label="Período das execuções" className={`grid grid-cols-3 sm:flex sm:flex-wrap rounded-xl border bg-card p-1 ${className}`}>
      {options.map(([period, label]) => <button key={period} type="button" aria-pressed={value === period} onClick={() => onChange(period)} className={`relative rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === period ? "text-primary-foreground" : "text-muted-foreground"}`}>
        {value === period && <motion.span aria-hidden="true" layoutId={reducedMotion ? undefined : "active-period"} initial={false} transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeInOut" }} className="pointer-events-none absolute inset-0 rounded-lg bg-primary" />}
        <span className="relative z-10">{label}</span>
      </button>)}
      <Popover open={open} onOpenChange={(nextOpen) => {
        if (nextOpen) { setStartDate(custom?.startDate ?? brazilDateKey()); setEndDate(custom?.endDate ?? brazilDateKey()); }
        setOpen(nextOpen);
      }}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={custom ? `Período personalizado: ${formatCustomPeriod(value)}` : "Selecionar período personalizado"} className={`relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${custom ? "text-primary-foreground" : "text-muted-foreground"}`}>
            {custom && <motion.span aria-hidden="true" layoutId={reducedMotion ? undefined : "active-period"} initial={false} transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeInOut" }} className="pointer-events-none absolute inset-0 rounded-lg bg-primary" />}
            <CalendarDays aria-hidden="true" className="relative z-10 size-3.5 shrink-0" /><span className="relative z-10">{custom ? formatCustomPeriod(value) : "Personalizado"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] rounded-xl">
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!validRange) return; onChange(next); setOpen(false); }}>
            <div><p className="text-sm font-semibold">Personalizar período</p><p className="mt-1 text-xs text-muted-foreground">Inclui os dois dias completos, no horário de Brasília.</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-2"><Label htmlFor={`${id}-start`}>Data inicial</Label><Input id={`${id}-start`} type="date" required value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></div>
              <div className="min-w-0 space-y-2"><Label htmlFor={`${id}-end`}>Data final</Label><Input id={`${id}-end`} type="date" required value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></div>
            </div>
            {startDate && endDate && !validRange && <p role="alert" className="text-xs text-destructive">Informe datas válidas. A data final deve ser igual ou posterior à inicial.</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" size="sm" disabled={!validRange}>Aplicar</Button></div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  </LayoutGroup>;
}
