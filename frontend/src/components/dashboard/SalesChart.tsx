'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { localCommercialDay } from '@/lib/commercialDates';

type Granularity = 'day' | 'week' | 'month';
type RangePreset = '7d' | '30d' | 'month' | 'year' | 'custom';
type SalesData = {
  from: string;
  to: string;
  granularity: Granularity;
  series: Array<{ period: string; sales: number; revenue: string }>;
  summary: { revenue: string; sales: number; averageTicket: string };
  comparison: { previousRevenue: string; previousSales: number; revenuePercent: number | null; salesPercent: number | null; from: string; to: string };
};
type SalesPoint = { period: string; sales: number; revenue: number };

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const integer = new Intl.NumberFormat('pt-BR');

function shiftDate(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localCommercialDay(date);
}

function shiftMonth(day: string, offset: number) {
  const [year, month] = day.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1, 12);
  return localCommercialDay(date);
}

function dateForLabel(day: string, granularity: Granularity) {
  const [year, month, date] = day.split('-').map(Number);
  if (granularity === 'month') return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(year, month - 1, 1));
  return `${String(date).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function dateForLongLabel(day: string, granularity: Granularity) {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year, month - 1, date);
  return granularity === 'month'
    ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(value)
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(value);
}

function bucketKey(day: string, granularity: Granularity) {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, date));
  if (granularity === 'month') value.setUTCDate(1);
  if (granularity === 'week') value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function fillSeries(data: SalesData | null, from: string, to: string, granularity: Granularity): SalesPoint[] {
  if (!data) return [];
  const values = new Map(data.series.map(point => [point.period, { sales: point.sales, revenue: Number(point.revenue) || 0 }]));
  const end = new Date(`${bucketKey(to, granularity)}T00:00:00.000Z`);
  const cursor = new Date(`${bucketKey(from, granularity)}T00:00:00.000Z`);
  const points: SalesPoint[] = [];
  while (cursor <= end && points.length < 370) {
    const period = cursor.toISOString().slice(0, 10);
    points.push({ period, ...(values.get(period) || { sales: 0, revenue: 0 }) });
    if (granularity === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else if (granularity === 'week') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

function periodPreset(preset: Exclude<RangePreset, 'custom'>, today: string) {
  if (preset === '7d') return { from: shiftDate(today, -6), to: today, granularity: 'day' as const };
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today, granularity: 'day' as const };
  if (preset === 'year') return { from: `${shiftMonth(today, -11).slice(0, 7)}-01`, to: today, granularity: 'month' as const };
  return { from: shiftDate(today, -29), to: today, granularity: 'day' as const };
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-bg)]/60 p-4 min-w-0">
    <p className="text-xs text-[var(--studio-muted)]">{label}</p>
    <strong className="mt-2 block truncate text-xl font-semibold tabular-nums text-white sm:text-2xl">{value}</strong>
    <p className="mt-1 text-[11px] text-[var(--studio-muted)]">{hint}</p>
  </div>;
}

export function SalesChart() {
  const [today, setToday] = useState(localCommercialDay);
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [range, setRange] = useState<{ from: string; to: string; granularity: Granularity }>(() => periodPreset('30d', localCommercialDay()));
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const requestId = useRef(0);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    const syncToday = () => setToday(localCommercialDay());
    const timer = window.setInterval(syncToday, 30_000);
    document.addEventListener('visibilitychange', syncToday);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', syncToday); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      try {
        const response = await api.get<SalesData>('/campaigns/commercial-sales', { params: { from: range.from, to: range.to, granularity: range.granularity } });
        if (!active || currentRequest !== requestId.current) return;
        setData(response.data);
        setError('');
        setUpdatedAt(new Date());
      } catch {
        if (active && currentRequest === requestId.current) setError('Não foi possível atualizar as vendas. Tente novamente.');
      } finally {
        if (active && currentRequest === requestId.current) setLoading(false);
      }
    };
    refresh.current = () => { void load(); };
    void Promise.resolve().then(load);
    const updateWhenVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(updateWhenVisible, 30_000);
    window.addEventListener('commercial:updated', updateWhenVisible);
    document.addEventListener('visibilitychange', updateWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('commercial:updated', updateWhenVisible);
      document.removeEventListener('visibilitychange', updateWhenVisible);
    };
  }, [range.from, range.to, range.granularity]);

  const points = useMemo(() => fillSeries(data, range.from, range.to, range.granularity), [data, range.from, range.to, range.granularity]);
  const selectedPoint = points.find(point => point.period === selectedPeriod) || points[points.length - 1] || null;
  const maxRevenue = Math.max(0, ...points.map(point => point.revenue));
  const bestDay = points.reduce<SalesPoint | null>((best, point) => point.revenue > (best?.revenue || 0) ? point : best, null);
  const labelStride = Math.max(1, Math.ceil(points.length / 10));

  const choosePreset = (nextPreset: Exclude<RangePreset, 'custom'>) => {
    setPreset(nextPreset);
    setRange(periodPreset(nextPreset, today));
    setSelectedPeriod('');
  };

  const updateCustomDate = (key: 'from' | 'to', value: string) => {
    if (!value) return;
    setPreset('custom');
    setSelectedPeriod('');
    setRange(previous => ({ ...previous, [key]: value }));
  };

  const comparisonText = data?.comparison.revenuePercent === null || data?.comparison.revenuePercent === undefined
    ? 'Sem vendas no período anterior'
    : `${data.comparison.revenuePercent > 0 ? '+' : ''}${data.comparison.revenuePercent.toLocaleString('pt-BR')}% vs. período anterior`;
  return <section aria-label="Gráfico de vendas" className="dash-card space-y-5 rounded-2xl p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--studio-accent)]/25 bg-[var(--studio-accent)]/10 text-[var(--studio-accent)]"><BarChart3 size={18} /></span>
        <div><span className="studio-eyebrow">RESULTADOS REGISTRADOS</span><h3 className="mt-1 text-lg font-semibold text-white">Vendas</h3><p className="mt-1 max-w-xl text-sm text-[var(--studio-muted)]">Registre o valor e a data no acompanhamento do contato. O gráfico soma as vendas do seu workspace.</p></div>
      </div>
      <button type="button" disabled={loading} onClick={() => refresh.current()} className="dash-btn-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Atualizar</button>
    </header>

    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período do gráfico">
      {([
        ['7d', '7 dias'], ['30d', '30 dias'], ['month', 'Este mês'], ['year', '12 meses'],
      ] as Array<[Exclude<RangePreset, 'custom'>, string]>).map(([id, label]) => <button key={id} type="button" aria-pressed={preset === id} onClick={() => choosePreset(id)} className={`${preset === id ? 'dash-btn-primary' : 'dash-btn-secondary'} rounded-lg px-3 py-2 text-xs`}>{label}</button>)}
      <span className="hidden h-6 w-px bg-[var(--studio-line)] sm:block" aria-hidden="true" />
      <label className="flex items-center gap-2 text-xs text-[var(--studio-muted)]"><CalendarDays size={14} /><span className="sr-only">Data inicial</span><input type="date" aria-label="Data inicial das vendas" value={range.from} max={range.to} onChange={event => updateCustomDate('from', event.target.value)} className="dash-input rounded-lg px-2 py-1.5 [color-scheme:dark]" /></label>
      <span className="text-xs text-[var(--studio-muted)]">até</span>
      <label className="text-xs text-[var(--studio-muted)]"><span className="sr-only">Data final</span><input type="date" aria-label="Data final das vendas" value={range.to} min={range.from} max={today} onChange={event => updateCustomDate('to', event.target.value)} className="dash-input rounded-lg px-2 py-1.5 [color-scheme:dark]" /></label>
      <label className="ml-auto flex items-center gap-2 text-xs text-[var(--studio-muted)]"><span>Agrupar por</span><select aria-label="Agrupar vendas por período" value={range.granularity} onChange={event => { setPreset('custom'); setRange(previous => ({ ...previous, granularity: event.target.value as Granularity })); }} className="dash-input rounded-lg px-2 py-1.5"><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option></select></label>
    </div>

    {error && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm text-amber-200">{error}{data ? ' Os dados mostrados são da última atualização.' : ''}</p>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Faturamento registrado" value={data ? currency.format(Number(data.summary.revenue)) : '—'} hint={comparisonText} />
      <Stat label="Vendas" value={data ? integer.format(data.summary.sales) : '—'} hint={data ? `${integer.format(data.comparison.previousSales)} no período anterior` : 'Carregando dados'} />
      <Stat label="Ticket médio" value={data ? currency.format(Number(data.summary.averageTicket)) : '—'} hint="Faturamento ÷ vendas registradas" />
      <Stat label="Melhor período" value={bestDay?.revenue ? currency.format(bestDay.revenue) : '—'} hint={bestDay?.revenue ? dateForLongLabel(bestDay.period, range.granularity) : 'Sem vendas registradas'} />
    </div>

    <div className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-bg)]/45 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-medium text-white">Faturamento por {range.granularity === 'day' ? 'dia' : range.granularity === 'week' ? 'semana' : 'mês'}</p><p className="mt-1 text-xs text-[var(--studio-muted)]">{dateForLongLabel(range.from, 'day')} — {dateForLongLabel(range.to, 'day')}</p></div>
        {selectedPoint && <p role="status" className="text-right text-xs text-[var(--studio-muted)]">{dateForLongLabel(selectedPoint.period, range.granularity)} · <strong className="text-white">{currency.format(selectedPoint.revenue)}</strong> · {integer.format(selectedPoint.sales)} {selectedPoint.sales === 1 ? 'venda' : 'vendas'}</p>}
      </div>
      {loading && !data ? <div className="h-56 animate-pulse rounded-xl bg-white/[0.03]" aria-label="Carregando gráfico de vendas" /> : !data ? <div className="grid h-56 place-items-center rounded-xl border border-dashed border-[var(--studio-line)] px-4 text-center text-sm text-[var(--studio-muted)]">Os dados de vendas estão indisponíveis. Use Atualizar para tentar novamente.</div> : !data.summary.sales ? <div className="grid h-56 place-items-center rounded-xl border border-dashed border-[var(--studio-line)] px-4 text-center text-sm text-[var(--studio-muted)]">Nenhuma venda registrada neste período. Abra o acompanhamento de um contato e registre o valor e a data da venda.</div> : (
        <div className="overflow-x-auto pb-2">
          <div role="list" aria-label="Faturamento registrado em cada período" className="flex h-56 min-w-[640px] items-stretch gap-1.5 border-b border-l border-[var(--studio-line)] px-2 pt-3 sm:gap-2" style={{ minWidth: `${Math.max(640, points.length * 36)}px` }}>
            {points.map((point, index) => {
              const height = maxRevenue ? Math.max(point.revenue ? 7 : 1.5, point.revenue / maxRevenue * 100) : 0;
              const showLabel = points.length <= 14 || index % labelStride === 0 || index === points.length - 1;
              const selected = selectedPoint?.period === point.period;
              return <div key={point.period} role="listitem" className="flex min-w-0 flex-1 flex-col justify-end">
                <button type="button" aria-label={`${dateForLongLabel(point.period, range.granularity)}: ${currency.format(point.revenue)}, ${integer.format(point.sales)} ${point.sales === 1 ? 'venda' : 'vendas'}`} aria-pressed={selected} title={`${dateForLongLabel(point.period, range.granularity)} · ${currency.format(point.revenue)} · ${integer.format(point.sales)} vendas`} onClick={() => setSelectedPeriod(point.period)} className="group flex h-full w-full items-end justify-center rounded-t-md px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]">
                  <span className={`w-full max-w-8 rounded-t-md transition-[height,background-color,opacity] duration-300 ${point.revenue ? selected ? 'bg-[var(--studio-accent)]' : 'bg-[var(--studio-accent)]/60 group-hover:bg-[var(--studio-accent)]' : 'bg-white/[0.06]'}`} style={{ height: `${height}%`, minHeight: point.revenue ? 5 : 2 }} />
                </button>
                <span className={`mt-2 h-4 text-center text-[9px] tabular-nums ${showLabel ? 'text-[var(--studio-muted)]' : 'text-transparent'}`}>{showLabel ? dateForLabel(point.period, range.granularity) : '·'}</span>
              </div>;
            })}
          </div>
        </div>
      )}
    </div>
    <footer className="flex flex-wrap justify-between gap-2 text-[11px] text-[var(--studio-muted)]"><span>Comparação com {data ? `${dateForLongLabel(data.comparison.from, 'day')} — ${dateForLongLabel(data.comparison.to, 'day')}` : 'o período anterior'}. Valores informados manualmente no CRM.</span><span>{updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString('pt-BR')}` : 'Aguardando atualização'}</span></footer>
  </section>;
}
