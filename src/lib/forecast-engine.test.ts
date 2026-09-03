import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { filterForecast, getForecast } from "./forecast-engine";

const range = { startDate: "2026-09-01", endDate: "2027-08-31" };

describe("forecast engine", () => {
  test("monthly obligation creates future occurrences; paid keeps only the next ones and cancelled none", () => {
    const result = getForecast({
      ...range,
      obligations: [
        {
          id: "active",
          due_date: "2026-09-10",
          amount: 2000,
          periodicity: "mensal",
          status: "pendente",
        },
        { id: "paid", due_date: "2026-09-10", amount: 1000, periodicity: "mensal", status: "pago" },
        {
          id: "paid-once",
          due_date: "2026-09-10",
          amount: 9000,
          periodicity: "unica",
          status: "pago",
        },
        {
          id: "cancelled",
          due_date: "2026-09-10",
          amount: 9000,
          periodicity: "mensal",
          status: "cancelado",
        },
      ],
    });
    assert.equal(result.items.filter((x) => x.sourceId === "active").length, 12);
    assert.equal(result.items.filter((x) => x.sourceId === "paid").length, 11);
    assert.equal(result.items.filter((x) => x.sourceId === "paid-once").length, 0);
    assert.equal(result.items.filter((x) => x.sourceId === "cancelled").length, 0);
    assert.equal(result.totals.total, 2_400_000 + 11 * 100_000);
  });


  test("10x card purchase only creates pending installments and never adds its statement", () => {
    const result = getForecast({
      ...range,
      cards: [{ id: "card", name: "Nubank", profile_id: "p", due_day: 10 }],
      statements: [
        {
          id: "s",
          card_id: "card",
          due_date: "2026-09-10",
          total_amount: 8500,
          status: "approved",
        },
      ],
      cardTransactions: [
        {
          id: "t",
          statement_id: "s",
          card_id: "card",
          description: "Notebook",
          amount: 850,
          installment_current: 4,
          installment_total: 10,
          status: "approved",
        },
      ],
    });
    assert.equal(result.items.length, 7);
    assert.deepEqual(
      result.items.map((x) => x.installmentCurrent),
      [4, 5, 6, 7, 8, 9, 10],
    );
    assert.equal(result.totals.cards, 595_000);
    assert.equal(
      result.items.some((x) => x.sourceType === "card_statement"),
      false,
    );
  });

  test("paid current statement removes its installment but keeps later ones", () => {
    const result = getForecast({
      ...range,
      cards: [{ id: "c", due_day: 10 }],
      statements: [
        {
          id: "s",
          card_id: "c",
          due_date: "2026-09-10",
          payment_status: "paid",
          status: "approved",
        },
      ],
      cardTransactions: [
        {
          id: "t",
          statement_id: "s",
          amount: 100,
          installment_current: 3,
          installment_total: 5,
          status: "approved",
        },
      ],
    });
    assert.deepEqual(
      result.items.map((x) => x.installmentCurrent),
      [4, 5],
    );
  });

  test("single card purchase replaces invoice fallback and linked receipt is not duplicated", () => {
    const result = getForecast({
      ...range,
      cards: [{ id: "c", profile_id: "p" }],
      statements: [
        { id: "s", card_id: "c", due_date: "2026-09-10", total_amount: 500, status: "approved" },
      ],
      cardTransactions: [
        {
          id: "t",
          statement_id: "s",
          card_id: "c",
          description: "Mercado",
          amount: 500,
          status: "approved",
          matched_import_row_id: "row-1",
        },
      ],
      futureReceipts: [
        {
          id: "r",
          payment_date: "2026-09-10",
          amount: 500,
          status: "approved",
          import_row_id: "row-1",
        },
      ],
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].sourceType, "credit_card_installment");
    assert.equal(result.totals.total, 50_000);
  });

  test("manual one-time and monthly recurrence land in correct months", () => {
    const result = getForecast({
      ...range,
      manualForecasts: [
        {
          id: "one",
          description: "Reforma",
          amount: 15000,
          start_date: "2026-10-15",
          recurrence: "once",
          kind: "investment",
          status: "active",
        },
        {
          id: "monthly",
          description: "Plano",
          amount: 100,
          start_date: "2026-09-05",
          end_date: "2026-11-05",
          recurrence: "mensal",
          kind: "fixed",
          status: "active",
        },
      ],
    });
    assert.equal(result.items.filter((x) => x.sourceId === "monthly").length, 3);
    assert.equal(result.months.find((x) => x.month === "2026-10")?.totalCents, 1_510_000);
  });

  test("variable historical estimate is explicitly estimated", () => {
    const result = getForecast({
      ...range,
      recurringFixedExpenses: [
        {
          id: "energy",
          name: "Energia",
          merchant_pattern: "energia",
          profile_id: "p",
          start_month: "2026-01-01",
          recurrence: "monthly",
          active: true,
        },
      ],
      historicalReceipts: [
        {
          id: "1",
          profile_id: "p",
          recipient_name: "Energia",
          payment_date: "2026-06-10",
          amount: 870,
          status: "approved",
        },
        {
          id: "2",
          profile_id: "p",
          recipient_name: "Energia",
          payment_date: "2026-07-10",
          amount: 920,
          status: "approved",
        },
        {
          id: "3",
          profile_id: "p",
          recipient_name: "Energia",
          payment_date: "2026-08-10",
          amount: 910,
          status: "approved",
        },
      ],
    });
    assert.equal(result.items[0].status, "estimated");
    assert.equal(result.items[0].amountCents, 90_000);
  });

  test("every card and month total equals its details", () => {
    const result = getForecast({
      ...range,
      obligations: [
        {
          id: "o",
          due_date: "2026-09-10",
          amount: 10.01,
          periodicity: "mensal",
          status: "pendente",
        },
      ],
      manualForecasts: [
        {
          id: "m",
          description: "Manual",
          amount: 20.02,
          start_date: "2026-09-20",
          recurrence: "once",
          kind: "variable",
          status: "active",
        },
      ],
    });
    assert.equal(
      result.totals.total,
      result.items.reduce((s, x) => s + x.amountCents, 0),
    );
    for (const month of result.months)
      assert.equal(
        month.totalCents,
        month.items.reduce((s, x) => s + x.amountCents, 0),
      );
  });

  test("property filter recalculates cards, charts and details from one result", () => {
    const raw = getForecast({
      ...range,
      manualForecasts: [
        {
          id: "a",
          description: "A",
          amount: 10,
          start_date: "2026-09-01",
          recurrence: "once",
          kind: "fixed",
          status: "active",
          property_id: "house-a",
        },
        {
          id: "b",
          description: "B",
          amount: 20,
          start_date: "2026-09-01",
          recurrence: "once",
          kind: "fixed",
          status: "active",
          property_id: "house-b",
        },
      ],
    });
    const filtered = filterForecast(raw, { propertyId: "house-a" });
    assert.equal(filtered.items.length, 1);
    assert.equal(filtered.totals.total, 1_000);
    assert.equal(filtered.months[0].totalCents, 1_000);
  });

  test("profile filter recalculates the complete result", () => {
    const raw = getForecast({
      ...range,
      manualForecasts: [
        {
          id: "a",
          description: "A",
          amount: 10,
          start_date: "2026-09-01",
          recurrence: "once",
          kind: "fixed",
          status: "active",
          profile_id: "pf",
        },
        {
          id: "b",
          description: "B",
          amount: 20,
          start_date: "2026-09-01",
          recurrence: "once",
          kind: "fixed",
          status: "active",
          profile_id: "holding",
        },
      ],
    });
    assert.equal(filterForecast(raw, { profileId: "pf" }).totals.total, 1_000);
  });

  test("personal obligation keeps its personal profile link", () => {
    const result = getForecast({
      ...range,
      personalProfileId: "pf",
      obligations: [
        {
          id: "o",
          due_date: "2026-09-10",
          amount: 10,
          periodicity: "unica",
          status: "pendente",
          is_personal: true,
        },
      ],
    });
    assert.equal(result.items[0].profileId, "pf");
  });

  test("editing an obligation changes all recalculated occurrences", () => {
    const before = getForecast({
      ...range,
      obligations: [
        { id: "o", due_date: "2026-09-10", amount: 10, periodicity: "mensal", status: "pendente" },
      ],
    });
    const after = getForecast({
      ...range,
      obligations: [
        { id: "o", due_date: "2026-09-10", amount: 15, periodicity: "mensal", status: "pendente" },
      ],
    });
    assert.equal(after.totals.total - before.totals.total, 12 * 500);
  });

  test("cancelling an obligation removes every future occurrence", () => {
    const result = getForecast({
      ...range,
      obligations: [
        { id: "o", due_date: "2026-09-10", amount: 10, periodicity: "mensal", status: "cancelado" },
      ],
    });
    assert.equal(result.items.length, 0);
  });

  test("source and status filters preserve source identifiers for reporting", () => {
    const raw = getForecast({
      ...range,
      manualForecasts: [
        {
          id: "m",
          description: "Manual",
          amount: 10,
          start_date: "2026-09-01",
          recurrence: "once",
          kind: "expected",
          status: "active",
        },
      ],
    });
    const filtered = filterForecast(raw, { sourceType: "manual", status: "manual" });
    assert.equal(filtered.items[0].sourceId, "m");
    assert.equal(filtered.items[0].sourceType, "manual");
  });

  test("fallback invoice is used only without detailed transactions", () => {
    const result = getForecast({
      ...range,
      cards: [{ id: "c", profile_id: "p" }],
      statements: [
        { id: "s", card_id: "c", due_date: "2026-09-10", total_amount: 123.45, status: "approved" },
      ],
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].sourceType, "card_statement");
    assert.equal(result.totals.cards, 12_345);
  });

  test("paid fallback invoice is excluded", () => {
    const result = getForecast({
      ...range,
      statements: [
        {
          id: "s",
          due_date: "2026-09-10",
          total_amount: 123.45,
          status: "approved",
          payment_status: "paid",
        },
      ],
    });
    assert.equal(result.items.length, 0);
  });

  test("daily and weekly obligations stop at their configured end date", () => {
    const result = getForecast({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      obligations: [
        {
          id: "daily",
          description: "Cobrança diária",
          due_date: "2026-09-01",
          end_date: "2026-09-03",
          amount: 10,
          periodicity: "diaria",
          status: "pendente",
        },
        {
          id: "weekly",
          description: "Cobrança semanal",
          due_date: "2026-09-02",
          end_date: "2026-09-16",
          amount: 20,
          periodicity: "semanal",
          status: "pendente",
        },
      ],
    });
    assert.deepEqual(
      result.items.map((item) => item.date).sort(),
      ["2026-09-01", "2026-09-02", "2026-09-02", "2026-09-03", "2026-09-09", "2026-09-16"],
    );
  });

  test("period total equals the sum of all visible months", () => {
    const result = getForecast({
      ...range,
      manualForecasts: [
        {
          id: "m",
          description: "Manual",
          amount: 10.01,
          start_date: "2026-09-01",
          end_date: "2026-11-01",
          recurrence: "mensal",
          kind: "investment",
          status: "active",
        },
      ],
    });
    assert.equal(
      result.totals.total,
      result.months.reduce((sum, month) => sum + month.totalCents, 0),
    );
  });
});
