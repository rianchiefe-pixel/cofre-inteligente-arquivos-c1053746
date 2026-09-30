/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { occurrenceDates, type ForecastItem, type ForecastKind } from "./forecast-engine";

const sb = supabase as any;

export type EditScope = "this" | "future" | "all";
export type ForecastEdit = {
  description: string;
  amount: number;
  date: string;
  kind: ForecastKind;
  categoryId: string | null;
  accountId: string | null;
  bankId: string | null;
  cardId: string | null;
  paymentMethod: string | null;
  recurrence: string;
};

/** Origem que aceita edição de série (obrigação e previsão manual). */
export const isSeriesEditable = (x: ForecastItem) =>
  x.editSource === "obligation" || x.editSource === "manual";
export const isRecurring = (x: ForecastItem) =>
  isSeriesEditable(x) && !!x.recurrence && !["unica", "once", "sem_recorrencia", ""].includes(x.recurrence);

const dayBefore = (value: string) => {
  const d = new Date(`${value}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

async function userId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Não autenticado");
  return data.user.id;
}

async function audit(uid: string, action: string, item: ForecastItem, oldValue: any, newValue: any) {
  await sb.from("audit_logs").insert({
    user_id: uid,
    action,
    entity: `forecast:${item.editSource ?? item.sourceType}`,
    entity_id: /^[0-9a-f-]{36}$/i.test(item.sourceId) ? item.sourceId : null,
    old_value: oldValue,
    new_value: newValue,
    note: `Previsibilidade — ocorrência ${item.occurrenceDate ?? item.date}`,
  });
}

const behaviorFromKind = (kind: ForecastKind) =>
  kind === "variable" ? "variable" : kind === "fixed" ? "fixed" : "undefined";
const obligationPeriodicity = (r: string) => (r === "once" ? "unica" : r);
const manualRecurrence = (r: string) => (r === "unica" ? "once" : r);

async function upsertOverride(uid: string, item: ForecastItem, fields: Record<string, any>) {
  const { error } = await sb.from("forecast_overrides").upsert(
    {
      user_id: uid,
      source_type: item.editSource ?? item.sourceType,
      source_id: item.sourceId,
      occurrence_date: item.occurrenceDate ?? item.date,
      ...fields,
    },
    { onConflict: "user_id,source_type,source_id,occurrence_date" },
  );
  if (error) throw error;
}

async function setObligationCategory(obligationId: string, categoryId: string | null) {
  await sb.from("property_obligation_categories").delete().eq("obligation_id", obligationId);
  if (categoryId)
    await sb
      .from("property_obligation_categories")
      .insert({ obligation_id: obligationId, category_id: categoryId });
}

export async function editForecastItem(item: ForecastItem, edit: ForecastEdit, scope: EditScope) {
  const uid = await userId();
  const occurrence = item.occurrenceDate ?? item.date;

  if (scope === "this" || !isSeriesEditable(item)) {
    if (item.editSource === "receipt") {
      const { error } = await sb
        .from("receipts")
        .update({
          description: edit.description,
          amount: edit.amount,
          payment_date: edit.date,
          category_id: edit.categoryId,
          account_id: edit.accountId,
          bank_id: edit.bankId,
          card_id: edit.cardId,
          payment_method: edit.paymentMethod,
          expense_behavior: behaviorFromKind(edit.kind) === "undefined" ? null : behaviorFromKind(edit.kind),
        })
        .eq("id", item.sourceId);
      if (error) throw error;
    } else {
      await upsertOverride(uid, item, {
        action: "override",
        amount: edit.amount,
        description: edit.description,
        date: edit.date,
        kind: edit.kind,
        category_id: edit.categoryId,
        account_id: edit.accountId,
        bank_id: edit.bankId,
        card_id: edit.cardId,
        payment_method: edit.paymentMethod,
      });
    }
    await audit(uid, "forecast_edit_occurrence", item, { amountCents: item.amountCents }, edit);
    return;
  }

  if (item.editSource === "obligation") {
    const { data: original, error } = await sb
      .from("property_obligations")
      .select("*")
      .eq("id", item.sourceId)
      .single();
    if (error) throw error;
    const values = {
      label: edit.description,
      amount: edit.amount,
      periodicity: obligationPeriodicity(edit.recurrence),
      expense_behavior: behaviorFromKind(edit.kind),
      account_id: edit.accountId,
      bank_id: edit.bankId,
    };
    if (scope === "future" && occurrence > String(original.due_date).slice(0, 10)) {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = original;
      const { error: e1 } = await sb
        .from("property_obligations")
        .update({ end_date: dayBefore(occurrence) })
        .eq("id", original.id);
      if (e1) throw e1;
      const { data: created, error: e2 } = await sb
        .from("property_obligations")
        .insert({ ...rest, ...values, due_date: edit.date, status: "pendente", end_date: original.end_date })
        .select("id")
        .single();
      if (e2) throw e2;
      await setObligationCategory(created.id, edit.categoryId);
    } else {
      const shiftDate = edit.date !== occurrence ? { due_date: edit.date } : {};
      const { error: e } = await sb
        .from("property_obligations")
        .update({ ...values, ...shiftDate })
        .eq("id", original.id);
      if (e) throw e;
      await setObligationCategory(original.id, edit.categoryId);
    }
    await audit(uid, `forecast_edit_${scope}`, item, original, edit);
    return;
  }

  // Previsão manual (inclui compras parceladas no cartão cadastradas manualmente)
  const { data: original, error } = await sb
    .from("financial_forecasts")
    .select("*")
    .eq("id", item.sourceId)
    .single();
  if (error) throw error;
  const values = {
    description: edit.description,
    amount: edit.amount,
    kind: edit.kind,
    recurrence: manualRecurrence(edit.recurrence),
    category_id: edit.categoryId,
    account_id: edit.accountId,
    bank_id: edit.bankId,
    card_id: edit.cardId,
    payment_method: edit.paymentMethod,
    origin: edit.cardId && String(edit.paymentMethod ?? "").startsWith("credito") ? "credit_card" : original.origin === "credit_card" && !edit.cardId ? "manual" : original.origin,
  };
  if (scope === "future" && occurrence > String(original.start_date).slice(0, 10)) {
    const before = occurrenceDates(
      original.start_date,
      original.recurrence,
      original.start_date,
      dayBefore(occurrence),
      original.end_date,
      original.occurrence_count,
    ).length;
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = original;
    const { error: e1 } = await sb
      .from("financial_forecasts")
      .update({ end_date: dayBefore(occurrence), occurrence_count: original.occurrence_count ? before : null })
      .eq("id", original.id);
    if (e1) throw e1;
    const { error: e2 } = await sb.from("financial_forecasts").insert({
      ...rest,
      ...values,
      start_date: edit.date,
      occurrence_count: original.occurrence_count ? original.occurrence_count - before : null,
    });
    if (e2) throw e2;
  } else {
    const shiftDate = edit.date !== occurrence ? { start_date: edit.date } : {};
    const { error: e } = await sb
      .from("financial_forecasts")
      .update({ ...values, ...shiftDate })
      .eq("id", original.id);
    if (e) throw e;
  }
  await audit(uid, `forecast_edit_${scope}`, item, original, edit);
}

export async function deleteForecastItem(item: ForecastItem, scope: EditScope) {
  const uid = await userId();
  const occurrence = item.occurrenceDate ?? item.date;
  if (scope === "this" || !isSeriesEditable(item)) {
    await upsertOverride(uid, item, { action: "skip" });
    await audit(uid, "forecast_skip_occurrence", item, { amountCents: item.amountCents }, null);
    return;
  }
  const table = item.editSource === "obligation" ? "property_obligations" : "financial_forecasts";
  const startCol = item.editSource === "obligation" ? "due_date" : "start_date";
  const cancelled = item.editSource === "obligation" ? "cancelado" : "cancelled";
  const { data: original, error } = await sb.from(table).select("*").eq("id", item.sourceId).single();
  if (error) throw error;
  let patch: Record<string, any>;
  if (scope === "future" && occurrence > String(original[startCol]).slice(0, 10)) {
    patch = { end_date: dayBefore(occurrence) };
    if (table === "financial_forecasts" && original.occurrence_count)
      patch.occurrence_count = occurrenceDates(
        original.start_date,
        original.recurrence,
        original.start_date,
        dayBefore(occurrence),
        original.end_date,
        original.occurrence_count,
      ).length;
  } else {
    patch = { status: cancelled };
  }
  const { error: e } = await sb.from(table).update(patch).eq("id", original.id);
  if (e) throw e;
  await audit(uid, `forecast_delete_${scope}`, item, original, patch);
}
