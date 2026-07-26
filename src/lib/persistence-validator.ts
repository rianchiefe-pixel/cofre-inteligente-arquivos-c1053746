import { parseMoneyToCents } from "./format";

export function assertMatchingAmounts(
  rowAmount: unknown,
  receiptAmount: unknown
): void {
  const rowCents = parseMoneyToCents(rowAmount);
  const receiptCents = parseMoneyToCents(receiptAmount);

  if (
    rowCents === null ||
    receiptCents === null ||
    Math.abs(rowCents) !== Math.abs(receiptCents)
  ) {
    throw new Error(
      `Vínculo recusado: valores financeiros divergentes ` +
      `(Planilha: ${rowAmount} | Comprovante: ${receiptAmount}).`
    );
  }
}