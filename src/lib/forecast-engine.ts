/* eslint-disable @typescript-eslint/no-explicit-any */
export type ForecastKind = "fixed" | "variable" | "expected" | "investment";
export type ForecastStatus = "confirmed" | "estimated" | "manual";
export type ForecastSourceType =
  | "obligation"
  | "credit_card_installment"
  | "card_statement"
  | "future_receipt"
  | "history_estimate"
  | "manual";

export type ForecastItem = {
  id: string;
  sourceType: ForecastSourceType;
  sourceId: string;
  sourceOccurrenceId: string;
  date: string;
  month: string;
  description: string;
  kind: ForecastKind;
  status: ForecastStatus;
  amountCents: number;
  profileId: string | null;
  propertyId: string | null;
  categoryId: string | null;
  categoryName?: string | null;
  recipient?: string | null;
  paymentMethod?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  cardId?: string | null;
  cardName?: string | null;
  bankId?: string | null;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
  originLabel: string;
  originalPath?: string | null;
  createdAt?: string | null;
  recurrence?: string | null;
};

export type ForecastMonth = {
  month: string;
  totalCents: number;
  byKind: Record<ForecastKind, number>;
  items: ForecastItem[];
};

export type ForecastResult = {
  items: ForecastItem[];
  months: ForecastMonth[];
  totals: Record<ForecastKind, number> & {
    total: number;
    cards: number;
    obligations: number;
    manual: number;
    manualCount: number;
  };
};

export type ForecastInput = {
  startDate: string;
  endDate: string;
  personalProfileId?: string | null;
  obligations?: any[];
  obligationCategories?: any[];
  cards?: any[];
  statements?: any[];
  cardTransactions?: any[];
  futureReceipts?: any[];
  recurringFixedExpenses?: any[];
  historicalReceipts?: any[];
  manualForecasts?: any[];
};

const EMPTY_KINDS = (): Record<ForecastKind, number> => ({
  fixed: 0,
  variable: 0,
  expected: 0,
  investment: 0,
});
const dateOnly = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d || 1, 12);
};
const monthKey = (s: string) => s.slice(0, 7);
const cents = (v: unknown) => Math.round(Number(v || 0) * 100);
const normalize = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const addMonthsSafe = (value: string, months: number, preferredDay?: number | null) => {
  const d = parseDate(value);
  const day = preferredDay || d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, 12);
  target.setDate(Math.min(day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
  return dateOnly(target);
};
const recurrenceSpec = (value: unknown): { unit: "day" | "month"; step: number } | null => {
  const key = String(value ?? "").toLowerCase();
  if (["diaria", "diario", "daily"].includes(key)) return { unit: "day", step: 1 };
  if (["semanal", "weekly"].includes(key)) return { unit: "day", step: 7 };
  if (["quinzenal", "biweekly"].includes(key)) return { unit: "day", step: 14 };
  const months: Record<string, number> = {
    mensal: 1, monthly: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, yearly: 12,
  };
  return months[key] ? { unit: "month", step: months[key] } : null;
};
const intervalFor = (value: unknown) => recurrenceSpec(value)?.step ?? 0;
const inRange = (date: string, start: string, end: string) => date >= start && date <= end;
const activeStatus = (status: unknown) =>
  !["pago", "paid", "cancelado", "cancelled", "encerrado", "closed", "rejected", "duplicate"]
    .includes(String(status ?? "").toLowerCase());

function occurrenceDates(
  startValue: string,
  recurrence: unknown,
  rangeStart: string,
  rangeEnd: string,
  endValue?: string | null,
  maxOccurrences?: number | null,
) {
  const spec = recurrenceSpec(recurrence);
  const result: string[] = [];
  let cursor = startValue.slice(0, 10);
  let occurrence = 0;
  const nextDate = (value: string) => {
    if (!spec) return value;
    if (spec.unit === "day") {
      const next = parseDate(value);
      next.setDate(next.getDate() + spec.step);
      return dateOnly(next);
    }
    return addMonthsSafe(value, spec.step, parseDate(startValue).getDate());
  };
  while (cursor < rangeStart && spec) {
    cursor = nextDate(cursor);
    occurrence++;
    if (occurrence > 1200) return result;
  }
  while (
    cursor <= rangeEnd &&
    (!endValue || cursor <= endValue) &&
    (!maxOccurrences || occurrence < maxOccurrences)
  ) {
    if (cursor >= rangeStart) result.push(cursor);
    if (!spec) break;
    cursor = nextDate(cursor);
    occurrence++;
    if (occurrence > 1200) break;
  }
  return result;
}

function classifyReceipt(r: any): ForecastKind {
  if (r.transaction_type === "investimento") return "investment";
  if (r.expense_behavior === "fixed" || r.is_fixed || r.transaction_type === "gasto_fixo")
    return "fixed";
  if (r.expense_behavior === "variable" || r.transaction_type === "gasto_variavel")
    return "variable";
  return "expected";
}

export function getForecast(input: ForecastInput): ForecastResult {
  const { startDate, endDate } = input;
  const items: ForecastItem[] = [];
  const seen = new Set<string>();
  const cards = new Map((input.cards ?? []).map((x) => [x.id, x]));
  const statements = new Map((input.statements ?? []).map((x) => [x.id, x]));
  const categoryByObligation = new Map<string, any>();
  for (const link of input.obligationCategories ?? [])
    if (!categoryByObligation.has(link.obligation_id))
      categoryByObligation.set(link.obligation_id, link);
  const push = (item: ForecastItem) => {
    const key = `${item.sourceType}:${item.sourceId}:${item.sourceOccurrenceId}`;
    if (seen.has(key) || !item.amountCents || !inRange(item.date, startDate, endDate)) return;
    seen.add(key);
    items.push(item);
  };

  for (const o of input.obligations ?? []) {
    if (!o.due_date || cents(o.amount) <= 0) continue;
    const status = String(o.status ?? "").toLowerCase();
    const cancelled = ["cancelado", "cancelada", "cancelled", "encerrado", "closed", "rejected"].includes(status);
    const paid = ["pago", "paid"].includes(status);
    const recurringInterval = intervalFor(o.periodicity);
    // "Pago" numa obrigação recorrente refere-se apenas à parcela atual: as próximas continuam previstas.
    if (cancelled || (paid && recurringInterval === 0)) continue;
    const property = o.properties ?? o.property;
    const profileId =
      property?.profile_id ??
      o.profile_id ??
      (o.is_personal ? input.personalProfileId : null) ??
      null;
    const category = categoryByObligation.get(o.id);
    const behavior = String(o.expense_behavior ?? "undefined");
    const obligationKind: ForecastKind =
      behavior === "variable" ? "variable" : behavior === "credit_card" ? "expected" : "fixed";
    for (const date of occurrenceDates(o.due_date, o.periodicity, startDate, endDate, o.end_date)) {
      if (paid && date <= o.due_date.slice(0, 10)) continue;

      push({
        id: `obligation:${o.id}:${date}`,
        sourceType: "obligation",
        sourceId: o.id,
        sourceOccurrenceId: date,
        date,
        month: monthKey(date),
        description: o.label || o.kind || "Obrigação",
        kind: obligationKind,
        status: "confirmed",
        amountCents: cents(o.amount),
        profileId,
        propertyId: o.property_id ?? null,
        categoryId: category?.category_id ?? null,
        categoryName: category?.categories?.name ?? null,
        recipient: o.supplier ?? null,
        originLabel: "Obrigação",
        originalPath: o.is_personal
          ? "/app/personal-obligations"
          : o.property_id
            ? `/app/properties/${o.property_id}`
            : null,
        createdAt: o.created_at,
        recurrence: o.periodicity,
      });
    }
  }

  // A série mais recente de uma compra parcelada é autoritativa. Assim, a mesma
  // compra importada em várias faturas nunca é somada duas vezes.
  const series = new Map<string, any>();
  for (const tx of input.cardTransactions ?? []) {
    if (
      !activeStatus(tx.status) ||
      !tx.installment_total ||
      tx.installment_total < 2 ||
      cents(tx.amount) <= 0 ||
      ["credito", "estorno", "pagamento"].includes(tx.kind)
    )
      continue;
    const statement = statements.get(tx.statement_id);
    const cardId = tx.card_id ?? statement?.card_id ?? "unknown";
    const key =
      tx.original_series_id ||
      `${cardId}:${normalize(tx.description)}:${tx.installment_total}:${cents(tx.amount)}`;
    const previous = series.get(key);
    if (
      !previous ||
      Number(tx.installment_current || 1) > Number(previous.installment_current || 1) ||
      String(statement?.due_date || "") >
        String(statements.get(previous.statement_id)?.due_date || "")
    )
      series.set(key, tx);
  }
  const statementsWithDetailed = new Set<string>();
  for (const tx of series.values()) {
    const statement = statements.get(tx.statement_id);
    if (statement) statementsWithDetailed.add(statement.id);
    const card = cards.get(tx.card_id ?? statement?.card_id);
    let installment = Number(tx.installment_current || 1);
    let due =
      statement?.due_date ||
      (tx.txn_date ? addMonthsSafe(tx.txn_date, 1, card?.due_day) : startDate);
    if (["paid", "pago"].includes(String(statement?.payment_status))) {
      installment++;
      due = addMonthsSafe(due, 1, card?.due_day);
    }
    while (due < startDate && installment <= Number(tx.installment_total)) {
      installment++;
      due = addMonthsSafe(due, 1, card?.due_day);
    }
    for (
      ;
      installment <= Number(tx.installment_total) && due <= endDate;
      installment++, due = addMonthsSafe(due, 1, card?.due_day)
    ) {
      push({
        id: `card:${tx.id}:${installment}`,
        sourceType: "credit_card_installment",
        sourceId: tx.original_series_id || tx.id,
        sourceOccurrenceId: String(installment),
        date: due,
        month: monthKey(due),
        description: tx.description || "Compra parcelada",
        kind: "expected",
        status: "confirmed",
        amountCents: cents(tx.amount),
        profileId: tx.profile_id ?? card?.profile_id ?? null,
        propertyId: tx.property_id ?? null,
        categoryId: null,
        categoryName: tx.category ?? null,
        recipient: tx.merchant_normalized ?? tx.description ?? null,
        paymentMethod: "credito_parcelado",
        cardId: card?.id ?? null,
        cardName: card?.name ?? statement?.bank_name ?? null,
        bankId: card?.bank_id ?? null,
        installmentCurrent: installment,
        installmentTotal: Number(tx.installment_total),
        originLabel: "Parcela de cartão",
        originalPath: card?.id ? `/app/cards/${card.id}` : "/app/cards",
        createdAt: tx.created_at,
      });
    }
  }

  // Compras à vista também são compromissos da próxima fatura. Elas usam a
  // transação detalhada como fonte, sem somar novamente o total da fatura.
  for (const tx of input.cardTransactions ?? []) {
    if (
      !activeStatus(tx.status) ||
      Number(tx.installment_total || 0) > 1 ||
      cents(tx.amount) <= 0 ||
      ["credito", "estorno", "pagamento"].includes(tx.kind)
    )
      continue;
    const statement = statements.get(tx.statement_id);
    if (
      !statement?.due_date ||
      ["paid", "pago", "cancelled"].includes(String(statement.payment_status))
    )
      continue;
    statementsWithDetailed.add(statement.id);
    const card = cards.get(tx.card_id ?? statement.card_id);
    push({
      id: `card:${tx.id}:single`,
      sourceType: "credit_card_installment",
      sourceId: tx.id,
      sourceOccurrenceId: statement.due_date,
      date: statement.due_date,
      month: monthKey(statement.due_date),
      description: tx.description || "Compra no cartão",
      kind: "expected",
      status: "confirmed",
      amountCents: cents(tx.amount),
      profileId: tx.profile_id ?? card?.profile_id ?? null,
      propertyId: tx.property_id ?? null,
      categoryId: null,
      categoryName: tx.category ?? null,
      recipient: tx.merchant_normalized ?? tx.description ?? null,
      paymentMethod: "credito_vista",
      cardId: card?.id ?? null,
      cardName: card?.name ?? statement.bank_name ?? null,
      bankId: card?.bank_id ?? null,
      originLabel: "Compra no cartão",
      originalPath: card?.id ? `/app/cards/${card.id}` : "/app/cards",
      createdAt: tx.created_at,
    });
  }

  // Fatura é fallback somente quando não há nenhuma parcela detalhada aprovada.
  for (const s of input.statements ?? []) {
    if (
      !s.due_date ||
      !activeStatus(s.status) ||
      ["paid", "pago"].includes(String(s.payment_status)) ||
      statementsWithDetailed.has(s.id) ||
      cents(s.total_amount) <= 0
    )
      continue;
    const hasTransactions = (input.cardTransactions ?? []).some(
      (t) => t.statement_id === s.id && activeStatus(t.status),
    );
    if (hasTransactions) continue;
    const card = cards.get(s.card_id);
    push({
      id: `statement:${s.id}`,
      sourceType: "card_statement",
      sourceId: s.id,
      sourceOccurrenceId: s.due_date,
      date: s.due_date,
      month: monthKey(s.due_date),
      description: `Fatura ${card?.name || s.bank_name || "do cartão"}`,
      kind: "expected",
      status: "confirmed",
      amountCents: cents(s.total_amount),
      profileId: card?.profile_id ?? null,
      propertyId: null,
      categoryId: null,
      cardId: card?.id ?? null,
      cardName: card?.name ?? null,
      bankId: card?.bank_id ?? null,
      originLabel: "Fatura (sem detalhamento)",
      originalPath: card?.id ? `/app/cards/${card.id}` : "/app/cards",
      createdAt: s.created_at,
    });
  }

  const linkedImportRows = new Set(
    (input.cardTransactions ?? []).map((tx) => tx.matched_import_row_id).filter(Boolean),
  );
  for (const r of input.futureReceipts ?? []) {
    if (
      !r.payment_date ||
      r.payment_date < startDate ||
      r.duplicate_of ||
      linkedImportRows.has(r.import_row_id) ||
      !activeStatus(r.status) ||
      cents(r.amount) <= 0
    )
      continue;
    push({
      id: `receipt:${r.id}`,
      sourceType: "future_receipt",
      sourceId: r.id,
      sourceOccurrenceId: r.payment_date,
      date: r.payment_date,
      month: monthKey(r.payment_date),
      description: r.description || r.recipient_name || "Despesa prevista",
      kind: classifyReceipt(r),
      status: "confirmed",
      amountCents: cents(r.amount),
      profileId: r.profile_id ?? null,
      propertyId: r.property_id ?? null,
      categoryId: r.category_id ?? null,
      categoryName: r.category?.name ?? null,
      recipient: r.recipient_name ?? null,
      paymentMethod: r.payment_method ?? null,
      accountId: r.account_id ?? null,
      cardId: r.card_id ?? null,
      bankId: r.bank_id ?? null,
      originLabel: "Lançamento futuro",
      originalPath: "/app/vault",
      createdAt: r.created_at,
    });
  }

  // A obrigação cadastrada é a fonte mais segura: qualquer estimativa de gasto fixo
  // que se refira ao mesmo compromisso (nome/fornecedor ou mesma categoria) é descartada.
  const significantTokens = (value: unknown) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
  const obligationSignatures = (input.obligations ?? [])
    .filter((o) =>
      !["cancelado", "cancelled", "encerrado", "closed", "rejected"].includes(
        String(o.status ?? "").toLowerCase(),
      ),
    )

    .map((o) => {
      const property = o.properties ?? o.property;
      return {
        text: normalize(`${o.label} ${o.supplier}`),
        tokens: new Set(significantTokens(`${o.label} ${o.supplier}`)),
        categoryId: categoryByObligation.get(o.id)?.category_id ?? null,
        profileId:
          property?.profile_id ??
          o.profile_id ??
          (o.is_personal ? input.personalProfileId : null) ??
          null,
        propertyId: o.property_id ?? null,
      };
    });
  const coveredByObligation = (fixed: any) => {
    const name = normalize(`${fixed.name} ${fixed.merchant_pattern ?? ""}`);
    const tokens = significantTokens(`${fixed.name} ${fixed.merchant_pattern ?? ""}`);
    return obligationSignatures.some((sig) => {
      if (sig.text && name && (sig.text.includes(name) || name.includes(sig.text))) return true;
      if (tokens.some((t) => sig.tokens.has(t))) return true;
      return Boolean(
        fixed.category_id &&
          sig.categoryId === fixed.category_id &&
          (!fixed.profile_id || !sig.profileId || sig.profileId === fixed.profile_id),
      );
    });
  };
  // Cadastros repetidos do mesmo gasto fixo não podem multiplicar a previsão.
  const uniqueFixed = new Map<string, any>();
  for (const fixed of input.recurringFixedExpenses ?? []) {
    if (!fixed.active) continue;
    const key = [
      fixed.profile_id ?? "",
      fixed.property_id ?? "",
      fixed.category_id ?? "",
      normalize(fixed.merchant_pattern || fixed.name),
      normalize(fixed.recurrence || "monthly"),
    ].join("|");
    const previous = uniqueFixed.get(key);
    if (!previous || String(fixed.created_at || "") < String(previous.created_at || ""))
      uniqueFixed.set(key, fixed);
  }
  for (const fixed of uniqueFixed.values()) {
    if (coveredByObligation(fixed)) continue;

    const history = (input.historicalReceipts ?? []).filter(
      (r) =>
        r.amount > 0 &&
        r.status === "approved" &&
        !r.duplicate_of &&
        r.profile_id === fixed.profile_id &&
        (!fixed.property_id || r.property_id === fixed.property_id) &&
        (!fixed.category_id || r.category_id === fixed.category_id) &&
        (!fixed.merchant_pattern ||
          normalize(`${r.recipient_name} ${r.description}`).includes(
            normalize(fixed.merchant_pattern),
          )),
    );
    const monthValues = new Map<string, number>();
    for (const row of history)
      monthValues.set(
        monthKey(row.payment_date),
        (monthValues.get(monthKey(row.payment_date)) || 0) + cents(row.amount),
      );
    const values = [...monthValues.values()].slice(-6).sort((a, b) => a - b);
    if (values.length < 2) continue;
    const trimmed = values.length >= 5 ? values.slice(1, -1) : values;
    const average = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
    const start = fixed.start_month > startDate ? fixed.start_month : startDate;
    for (const date of occurrenceDates(
      start,
      fixed.recurrence || "monthly",
      startDate,
      endDate,
      fixed.end_month,
    )) {
      const due = `${monthKey(date)}-${String(Math.min(parseDate(fixed.start_month).getDate(), 28)).padStart(2, "0")}`;
      push({
        id: `estimate:${fixed.id}:${monthKey(due)}`,
        sourceType: "history_estimate",
        sourceId: fixed.id,
        sourceOccurrenceId: monthKey(due),
        date: due,
        month: monthKey(due),
        description: fixed.name,
        kind: "fixed",
        status: "estimated",
        amountCents: average,
        profileId: fixed.profile_id,
        propertyId: fixed.property_id ?? null,
        categoryId: fixed.category_id ?? null,
        recipient: fixed.merchant_pattern ?? null,
        originLabel: "Histórico / estimativa",
        originalPath: "/app/fixed-expenses",
        createdAt: fixed.created_at,
        recurrence: fixed.recurrence,
      });
    }
  }

  // Gastos variáveis: média mensal por categoria com base no histórico real,
  // ignorando o que já é projetado como gasto fixo.
  const isFixedHistory = (r: any) =>
    [...uniqueFixed.values()].some(
      (f) =>
        f.profile_id === r.profile_id &&
        (!f.property_id || f.property_id === r.property_id) &&
        (!f.category_id || f.category_id === r.category_id) &&
        (!f.merchant_pattern ||
          normalize(`${r.recipient_name} ${r.description}`).includes(
            normalize(f.merchant_pattern),
          )),
    );
  const variableGroups = new Map<
    string,
    {
      profileId: string | null;
      propertyId: string | null;
      categoryId: string | null;
      categoryName: string | null;
      months: Map<string, number>;
    }
  >();
  for (const r of input.historicalReceipts ?? []) {
    if (!r.payment_date || r.duplicate_of || r.status !== "approved" || cents(r.amount) <= 0)
      continue;
    const behavior =
      r.expense_behavior ??
      (r.transaction_type === "gasto_variavel"
        ? "variable"
        : r.transaction_type === "gasto_fixo"
          ? "fixed"
          : null);
    if (behavior !== "variable") continue;
    if (isFixedHistory(r)) continue;
    const key = `${r.profile_id ?? ""}:${r.category_id ?? "none"}`;
    const group = variableGroups.get(key) ?? {
      profileId: r.profile_id ?? null,
      propertyId: null,
      categoryId: r.category_id ?? null,
      categoryName: r.category?.name ?? null,
      months: new Map<string, number>(),
    };
    group.months.set(
      monthKey(r.payment_date),
      (group.months.get(monthKey(r.payment_date)) || 0) + cents(r.amount),
    );
    variableGroups.set(key, group);
  }
  // Categoria já vinculada a uma obrigação ativa tem lugar definido pela obrigação:
  // o histórico/estimativa daquela categoria não pode gerar gasto variável duplicado.
  const obligationProfileById = new Map<string, string | null>();
  for (const o of input.obligations ?? []) {
    // "Pago" só encerra a parcela atual: a obrigação continua sendo a dona da categoria.
    const status = String(o.status ?? "").toLowerCase();
    if (["cancelado", "cancelled", "encerrado", "closed", "rejected"].includes(status)) continue;
    const property = o.properties ?? o.property;
    obligationProfileById.set(
      o.id,
      property?.profile_id ??
        o.profile_id ??
        (o.is_personal ? input.personalProfileId : null) ??
        null,
    );
  }

  const categoriesOwnedByObligation = new Set<string>();
  for (const link of input.obligationCategories ?? []) {
    if (!obligationProfileById.has(link.obligation_id) || !link.category_id) continue;
    categoriesOwnedByObligation.add(link.category_id);
  }

  for (const [key, group] of variableGroups) {
    if (group.categoryId && categoriesOwnedByObligation.has(group.categoryId)) continue;
    const values = [...group.months.values()].slice(-6).sort((a, b) => a - b);
    if (!values.length) continue;
    const trimmed = values.length >= 5 ? values.slice(1, -1) : values;
    const average = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
    if (average <= 0) continue;
    for (const date of occurrenceDates(`${monthKey(startDate)}-15`, "mensal", startDate, endDate)) {
      push({
        id: `variable:${key}:${monthKey(date)}`,
        sourceType: "history_estimate",
        sourceId: `variable:${key}`,
        sourceOccurrenceId: monthKey(date),
        date,
        month: monthKey(date),
        description: group.categoryName
          ? `Gastos variáveis — ${group.categoryName}`
          : "Gastos variáveis",
        kind: "variable",
        status: "estimated",
        amountCents: average,
        profileId: group.profileId,
        propertyId: group.propertyId,
        categoryId: group.categoryId,
        categoryName: group.categoryName,
        originLabel: "Histórico / estimativa",
        originalPath: "/app/vault",
        recurrence: "mensal",
      });
    }
  }



  for (const m of input.manualForecasts ?? []) {
    if (!activeStatus(m.status) || !m.start_date || cents(m.amount) <= 0) continue;
    for (const date of occurrenceDates(
      m.start_date,
      m.recurrence,
      startDate,
      endDate,
      m.end_date,
      m.occurrence_count,
    )) {
      push({
        id: `manual:${m.id}:${date}`,
        sourceType: "manual",
        sourceId: m.id,
        sourceOccurrenceId: date,
        date,
        month: monthKey(date),
        description: m.description,
        kind: m.kind,
        status: "manual",
        amountCents: cents(m.amount),
        profileId: m.profile_id ?? null,
        propertyId: m.property_id ?? null,
        categoryId: m.category_id ?? null,
        recipient: m.recipient_name ?? null,
        paymentMethod: m.payment_method ?? null,
        accountId: m.account_id ?? null,
        cardId: m.card_id ?? null,
        originLabel: "Previsão manual",
        createdAt: m.created_at,
        recurrence: m.recurrence,
      });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const months: ForecastMonth[] = [];
  let cursor = `${monthKey(startDate)}-01`;
  while (monthKey(cursor) <= monthKey(endDate)) {
    const key = monthKey(cursor);
    const monthItems = items.filter((x) => x.month === key);
    const byKind = EMPTY_KINDS();
    for (const item of monthItems) byKind[item.kind] += item.amountCents;
    months.push({
      month: key,
      totalCents: Object.values(byKind).reduce((a, b) => a + b, 0),
      byKind,
      items: monthItems,
    });
    cursor = addMonthsSafe(cursor, 1, 1);
  }
  const byKind = EMPTY_KINDS();
  for (const item of items) byKind[item.kind] += item.amountCents;
  return {
    items,
    months,
    totals: {
      ...byKind,
      total: items.reduce((s, x) => s + x.amountCents, 0),
      cards: items
        .filter(
          (x) => x.sourceType === "credit_card_installment" || x.sourceType === "card_statement",
        )
        .reduce((s, x) => s + x.amountCents, 0),
      obligations: items
        .filter((x) => x.sourceType === "obligation")
        .reduce((s, x) => s + x.amountCents, 0),
      manual: items.filter((x) => x.sourceType === "manual").reduce((s, x) => s + x.amountCents, 0),
      manualCount: items.filter((x) => x.sourceType === "manual").length,
    },
  };
}

export function filterForecast(
  result: ForecastResult,
  filters: {
    profileId?: string;
    propertyId?: string;
    categoryId?: string;
    sourceType?: string;
    status?: string;
    kind?: string;
    cardId?: string;
    accountId?: string;
    bankId?: string;
    recipient?: string;
  },
) {
  const items = result.items.filter(
    (x) =>
      (!filters.profileId || filters.profileId === "all" || x.profileId === filters.profileId) &&
      (!filters.propertyId ||
        filters.propertyId === "all" ||
        x.propertyId === filters.propertyId) &&
      (!filters.categoryId ||
        filters.categoryId === "all" ||
        x.categoryId === filters.categoryId) &&
      (!filters.sourceType ||
        filters.sourceType === "all" ||
        x.sourceType === filters.sourceType) &&
      (!filters.status || filters.status === "all" || x.status === filters.status) &&
      (!filters.kind || filters.kind === "all" || x.kind === filters.kind) &&
      (!filters.cardId || filters.cardId === "all" || x.cardId === filters.cardId) &&
      (!filters.accountId || filters.accountId === "all" || x.accountId === filters.accountId) &&
      (!filters.bankId || filters.bankId === "all" || x.bankId === filters.bankId) &&
      (!filters.recipient || filters.recipient === "all" || x.recipient === filters.recipient),
  );
  return summarizeForecastItems(
    items,
    result.months.map((x) => x.month),
  );
}

export function summarizeForecastItems(items: ForecastItem[], monthKeys: string[]): ForecastResult {
  const months = monthKeys.map((month) => {
    const monthItems = items.filter((x) => x.month === month);
    const byKind = EMPTY_KINDS();
    for (const item of monthItems) byKind[item.kind] += item.amountCents;
    return {
      month,
      totalCents: Object.values(byKind).reduce((a, b) => a + b, 0),
      byKind,
      items: monthItems,
    };
  });
  const byKind = EMPTY_KINDS();
  for (const item of items) byKind[item.kind] += item.amountCents;
  return {
    items,
    months,
    totals: {
      ...byKind,
      total: items.reduce((s, x) => s + x.amountCents, 0),
      cards: items
        .filter(
          (x) => x.sourceType === "credit_card_installment" || x.sourceType === "card_statement",
        )
        .reduce((s, x) => s + x.amountCents, 0),
      obligations: items
        .filter((x) => x.sourceType === "obligation")
        .reduce((s, x) => s + x.amountCents, 0),
      manual: items.filter((x) => x.sourceType === "manual").reduce((s, x) => s + x.amountCents, 0),
      manualCount: items.filter((x) => x.sourceType === "manual").length,
    },
  };
}
