import { parseMoneyToCents } from "./format";

/**
 * Função central de persistência que valida novamente os valores imediatamente antes de salvar.
 * O sistema é terminantemente proibido de vincular quando houver qualquer diferença (R$ 0,00 permitida).
 * Todas as rotas que criam ou alteram vínculos devem chamar obrigatoriamente essa função.
 */
export function assertMatchingAmounts(
  rowAmount: unknown,
  receiptAmount: unknown
): void {
  const rowCents = parseMoneyToCents(rowAmount);
  const receiptCents = parseMoneyToCents(receiptAmount);

  if (
    rowCents === null ||
    receiptCents === null ||
    rowCents !== receiptCents
  ) {
    throw new Error(
      `Vínculo recusado: valores financeiros divergentes (Planilha: ${rowAmount} | Comprovante: ${receiptAmount}).`
    );
  }
}
