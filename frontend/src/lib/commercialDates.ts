/** Datas comerciais são dias civis, sem conversão de fuso ou horário de envio. */
export function localCommercialDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function commercialDay(value?: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}
export function formatCommercialDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
export function reminderLabel(value: string | null | undefined, today: string): string {
  const day = commercialDay(value);
  if (!day) return 'Sem lembrete';
  if (day === today) return 'Retomar hoje';
  return `${day < today ? 'Atrasado' : 'Retomar'} · ${formatCommercialDay(day)}`;
}
