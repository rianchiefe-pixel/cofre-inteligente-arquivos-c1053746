/**
 * Central de prazos — cálculo de ocorrências e urgência.
 *
 * Regras:
 *  - Datas de vencimento são DATAS (sem hora): toda comparação é feita em
 *    horário local, nunca em UTC, para não vencer itens por fuso.
 *  - Obrigações recorrentes NÃO geram registros futuros no banco. A próxima
 *    ocorrência é calculada em memória a partir do vencimento cadastrado.
 *  - Dias 29/30/31 são ajustados para o último dia válido do mês e voltam ao
 *    dia original nos meses que o possuem.
 */

export type Urgency = "vencido" | "hoje" | "urgente" | "atencao" | "normal" | "concluido";

export type AgendaSource = "manual" | "pf" | "imovel";

export type AgendaItem = {
  key: string;
  source: AgendaSource;
  sourceLabel: string;
  recordId: string;
  propertyId?: string | null;
  title: string;
  dueDate: string | null;
  periodicity?: string | null;
  amount?: number | null;
  category?: string | null;
  notes?: string | null;
  status: string;
  urgency: Urgency;
  daysLeft: number | null;
  /** Verdadeiro quando a ocorrência exibida é posterior ao vencimento cadastrado. */
  rolled: boolean;
  raw: any;
};

const MONTH_STEP: Record<string, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/** Recorrências em dias (diária, semanal, quinzenal). */
const DAY_STEP: Record<string, number> = {
  diaria: 1,
  diario: 1,
  semanal: 7,
  quinzenal: 14,
};

export function todayLocalISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

/** Soma `months` ao vencimento base preservando o dia original com clamp no fim do mês. */
export function addMonthsClamped(baseISO: string, months: number): string {
  const base = parseISO(baseISO);
  if (!base) return baseISO;
  const total = base.m - 1 + months;
  const y = base.y + Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  const d = Math.min(base.d, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Soma `days` a uma data ISO (sem hora, horário local). */
export function addDaysISO(baseISO: string, days: number): string {
  const base = parseISO(baseISO);
  if (!base) return baseISO;
  const d = new Date(base.y, base.m - 1, base.d + days);
  return todayLocalISO(d);
}

/** Ocorrência número `k` (0 = vencimento cadastrado) para a periodicidade informada. */
function occurrenceAt(baseISO: string, periodicity: string | null | undefined, k: number): string | null {
  if (k === 0) return baseISO;
  const key = periodicity ?? "";
  if (DAY_STEP[key]) return addDaysISO(baseISO, DAY_STEP[key] * k);
  if (MONTH_STEP[key]) return addMonthsClamped(baseISO, MONTH_STEP[key] * k);
  return null;
}

export function isRecurring(periodicity?: string | null) {
  return Boolean(periodicity && (MONTH_STEP[periodicity] || DAY_STEP[periodicity]));
}

/** Diferença em dias (local) entre uma data ISO e hoje. */
export function daysFromToday(iso: string | null, todayISO = todayLocalISO()): number | null {
  if (!iso) return null;
  const a = parseISO(iso);
  const b = parseISO(todayISO);
  if (!a || !b) return null;
  const d1 = new Date(a.y, a.m - 1, a.d).getTime();
  const d2 = new Date(b.y, b.m - 1, b.d).getTime();
  return Math.round((d1 - d2) / 86400000);
}

const RESOLVED_STATUS = new Set(["pago", "cancelado", "concluida", "cancelada", "quitado", "resolvido"]);

const CANCELLED_STATUS = new Set(["cancelado", "cancelada", "cancelled", "encerrado", "closed", "rejected"]);

/** Cancelados saem da agenda: não geram cobrança nem próxima ocorrência. */
export function isCancelledStatus(status?: string | null) {
  return Boolean(status && CANCELLED_STATUS.has(String(status).toLowerCase()));
}

export function isResolvedStatus(status?: string | null) {
  return Boolean(status && RESOLVED_STATUS.has(status));
}

/**
 * Ocorrência relevante de uma obrigação.
 *  - Não recorrente: o próprio vencimento cadastrado.
 *  - Recorrente pendente: a última ocorrência já vencida (ou a futura, se ainda não venceu).
 *  - Recorrente quitada: a próxima ocorrência após o vencimento cadastrado.
 */
export function relevantOccurrence(
  dueDate: string | null,
  periodicity: string | null | undefined,
  status: string | null | undefined,
  todayISO = todayLocalISO(),
  endDate?: string | null,
): { date: string | null; rolled: boolean; resolved: boolean } {
  const resolved = isResolvedStatus(status);
  if (!dueDate || (endDate && dueDate > endDate)) return { date: null, rolled: false, resolved };
  if (!isRecurring(periodicity)) return { date: dueDate, rolled: false, resolved };

  let k = resolved ? 1 : 0;
  let date = occurrenceAt(dueDate, periodicity, k);
  if (!date || (endDate && date > endDate)) return { date: null, rolled: k > 0, resolved: false };
  // Avança até a ocorrência atual/próxima, sem ultrapassar a data final.
  for (let guard = 0; guard < 2000; guard++) {
    const next = occurrenceAt(dueDate, periodicity, k + 1);
    const nextDiff = next ? daysFromToday(next, todayISO) : null;
    const currentDiff = daysFromToday(date, todayISO);
    if (!next || (endDate && next > endDate)) break;
    if (currentDiff != null && currentDiff < 0 && nextDiff != null && nextDiff <= 0) {
      k += 1;
      date = next;
      continue;
    }
    if (resolved && currentDiff != null && currentDiff < 0) {
      k += 1;
      date = next;
      continue;
    }
    break;
  }
  return { date, rolled: k > 0, resolved: false };
}

export function urgencyOf(daysLeft: number | null, resolved: boolean): Urgency {
  if (resolved) return "concluido";
  if (daysLeft == null) return "normal";
  if (daysLeft < 0) return "vencido";
  if (daysLeft === 0) return "hoje";
  if (daysLeft === 1) return "urgente";
  if (daysLeft <= 7) return "atencao";
  return "normal";
}

export const URGENCY_ORDER: Record<Urgency, number> = {
  vencido: 0,
  hoje: 1,
  urgente: 2,
  atencao: 3,
  normal: 4,
  concluido: 5,
};

export function urgencyLabel(item: AgendaItem): string {
  const d = item.daysLeft;
  switch (item.urgency) {
    case "concluido":
      return "Concluído";
    case "vencido":
      return d != null ? `Vencido há ${-d} ${-d === 1 ? "dia" : "dias"}` : "Vencido";
    case "hoje":
      return "Vence hoje";
    case "urgente":
      return "Vence amanhã";
    case "atencao":
      return `Vence em ${d} dias`;
    default:
      return d != null ? `Vence em ${d} dias` : "Sem prazo";
  }
}

export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    const ua = URGENCY_ORDER[a.urgency];
    const ub = URGENCY_ORDER[b.urgency];
    if (ua !== ub) return ua - ub;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return a.title.localeCompare(b.title, "pt-BR");
  });
}

/** Item da agenda para uma tarefa manual. */
export function agendaFromTask(t: any, todayISO = todayLocalISO()): AgendaItem {
  const resolved = isResolvedStatus(t.status);
  const daysLeft = daysFromToday(t.due_date ?? null, todayISO);
  return {
    key: `task:${t.id}`,
    source: "manual",
    sourceLabel: t.properties?.name ? `Tarefa manual · ${t.properties.name}` : "Tarefa manual",
    recordId: t.id,
    propertyId: t.property_id ?? null,
    title: t.title,
    dueDate: t.due_date ?? null,
    periodicity: null,
    amount: null,
    category: null,
    notes: t.notes ?? t.description ?? null,
    status: t.status,
    urgency: urgencyOf(daysLeft, resolved),
    daysLeft,
    rolled: false,
    raw: t,
  };
}

/** Item da agenda para uma obrigação (PF ou de imóvel). */
export function agendaFromObligation(
  o: any,
  labelFor: (o: any) => string,
  propertyName?: string | null,
  todayISO = todayLocalISO(),
): AgendaItem {
  const occ = relevantOccurrence(o.due_date ?? null, o.periodicity, o.status, todayISO, o.end_date ?? null);
  const daysLeft = daysFromToday(occ.date, todayISO);
  const personal = Boolean(o.is_personal);
  return {
    key: `obl:${o.id}:${occ.date ?? "sem-data"}`,
    source: personal ? "pf" : "imovel",
    sourceLabel: personal
      ? "Obrigação PF"
      : propertyName
        ? `Imóvel — ${propertyName}`
        : "Obrigação de imóvel",
    recordId: o.id,
    propertyId: o.property_id ?? null,
    title: labelFor(o),
    dueDate: occ.date,
    periodicity: o.periodicity ?? null,
    amount: o.amount != null ? Number(o.amount) : null,
    category: o.kind ?? null,
    notes: o.notes ?? null,
    status: o.status ?? "pendente",
    urgency: urgencyOf(daysLeft, occ.resolved),
    daysLeft,
    rolled: occ.rolled,
    raw: o,
  };
}

/**
 * Itens da agenda para uma obrigação.
 *  - Quitada e recorrente: gera o item PAGO do ciclo atual (visível no filtro
 *    "Concluídos / pagos") + o item da próxima ocorrência.
 *  - Quitada e não recorrente: apenas o item pago.
 *  - Pendente: apenas a ocorrência relevante.
 */
export function agendaItemsFromObligation(
  o: any,
  labelFor: (o: any) => string,
  propertyName?: string | null,
  todayISO = todayLocalISO(),
): AgendaItem[] {
  const base = agendaFromObligation(o, labelFor, propertyName, todayISO);
  if (!isResolvedStatus(o.status)) return [base];

  const paidDate = o.due_date ?? null;
  const paidDaysLeft = daysFromToday(paidDate, todayISO);
  const paid: AgendaItem = {
    ...base,
    key: `obl:${o.id}:pago:${paidDate ?? "sem-data"}`,
    dueDate: paidDate,
    urgency: "concluido",
    daysLeft: paidDaysLeft,
    rolled: false,
  };

  if (!isRecurring(o.periodicity) || !base.dueDate || base.dueDate === paidDate) return [paid];
  return [paid, { ...base, rolled: true }];
}
