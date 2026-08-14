# Plan - Financial Report Refactor for Profile Isolation and New Presentation Models

Refactor the financial report generation to provide two distinct models: **Pessoal (Pessoa Física)** and **Holding**, with absolute profile isolation and specific visual rules.

## User Review Required

> [!IMPORTANT]
> - This refactor changes the visual structure of the PDFs and the presentation logic.
> - **Total = Expenses + Investments** remains the mathematical core.
> - In **Pessoal** mode, expenses are split into **Fixed**, **Variable**, and **Other (Null Behavior)** to avoid visual double-counting.
> - In **Holding** mode, behavior-based splitting is disabled; only **Expenses** and **Investments** are shown.

## Proposed Changes

### 1. `src/lib/report-data.ts`
- Enhance `MonthBlock` and `ReportDataset` interfaces to include `otherExpenseCents` and `otherExpenseCategories`.
- Update `loadReportDataset` to calculate `otherExpenseCents` (where `nature = despesa` and `behavior = null`).
- Ensure `totalCents` strictly follows `despesaCents + investimentoCents`.

### 2. `src/lib/report-templates.ts`
- Implement profile detection based on `f.profileId`.
- Create two main templates: `generatePessoalReport` and `generateHoldingReport`.
- **Pessoal Template**:
  - Update headers to "RELATÓRIO FINANCEIRO — PESSOA FÍSICA".
  - Add "OUTRAS DESPESAS" card and section.
  - Implement the "No Repetition" rule: split lists into Fixed, Variable, Other, and Investments.
  - Add "COMPOSIÇÃO DAS DESPESAS" summary.
  - Update monthly comparison table columns.
- **Holding Template**:
  - Update headers to "RELATÓRIO FINANCEIRO — HOLDING".
  - Remove Fixed/Variable cards, tables, and sections.
  - Present only "DESPESAS" and "INVESTIMENTOS".
- **Shared**:
  - Add profile name to footer for clarity.
  - Ensure absolute isolation by strictly using the dataset derived from the query.

### 3. `src/routes/_authenticated/app.reports.tsx`
- Ensure UI summaries (cards) match the new logic.
- Pass the correct profile-based titles to the report triggers.

### 4. `src/routes/index.tsx`
- Restore Landing Page content and update the audit protocol as requested.

## Technical Details

- **Profile IDs**:
  - Pessoal: `c44c244d-b05f-47dc-bc58-7056351e7703`
  - Holding: `2906fc21-93bc-42ad-8ca3-701b94fdb5f6`
- **Normalization**: `normalizeFinancialClassification` is already canonical and correctly handles `expense_behavior`.
- **Validation**: `REPORT_ALLOWED_RECEIPT_IDS` ensures no external data leaks into grouping.

## Verification Plan

- **Automated Tests**: Use Playwright to:
  1. Generate Pessoal PDF (Jan-Jul 2026) and verify presence of Fixed/Variable/Other sections and zero double-counting.
  2. Generate Holding PDF (Jan-Jul 2026) and verify absence of Fixed/Variable sections.
  3. Validate mathematical consistency: `Total = Expenses + Investments` and `Expenses = Fixed + Variable + Other`.
- **Manual Verification**: Check footer profile labels and header titles.
