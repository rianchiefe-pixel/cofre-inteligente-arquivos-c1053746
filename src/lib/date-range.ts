/**
 * Datas do banco são `date` puras (YYYY-MM-DD), sem fuso.
 * `toISOString()` converte para UTC e desloca o dia em fusos negativos
 * (no Brasil, dia 1 às 00:00 vira o último dia do mês anterior).
 * Estas funções trabalham sempre com os componentes locais da data.
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Primeiro e último dia do mês de referência, como strings YYYY-MM-DD. */
export function monthRange(ref: Date = new Date()): { from: string; to: string } {
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { from: toLocalISODate(from), to: toLocalISODate(to) };
}

/** Compara datas do banco como texto — evita qualquer conversão de fuso. */
export function isWithinRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!value) return false;
  const day = String(value).slice(0, 10);
  return day >= from && day <= to;
}

/**
 * Intervalo dos últimos `months` meses (inclui o mês corrente inteiro).
 * Usado nos painéis: aprovações de meses anteriores precisam entrar no cálculo.
 */
export function monthsBackRange(months: number, ref: Date = new Date()): { from: string; to: string } {
  const from = new Date(ref.getFullYear(), ref.getMonth() - (months - 1), 1);
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { from: toLocalISODate(from), to: toLocalISODate(to) };
}

/** Intervalo aberto — sem recorte de período. */
export function allTimeRange(): { from: string; to: string } {
  return { from: "0001-01-01", to: "9999-12-31" };
}
