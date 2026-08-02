// ---------------------------------------------------------------------------
// Classificador determinístico do tipo de lançamento (import_rows.kind).
//
// Segrega transações de cartão de crédito das demais movimentações antes do
// cruzamento com comprovantes — evita que uma compra parcelada na fatura seja
// vinculada a um Pix qualquer só porque o valor bate.
// ---------------------------------------------------------------------------

export type RowKind =
  | "cartao_credito"      // compra individual no cartão
  | "cartao_fatura"       // pagamento total da fatura
  | "pix"
  | "ted_doc"             // TED/DOC/transferência bancária
  | "boleto"
  | "debito"              // cartão de débito / compra no débito
  | "saque"
  | "deposito"
  | "tarifa"
  | "rendimento"          // juros, remuneração de saldo
  | "investimento"        // CDB, Tesouro, fundos, aplicações
  | "transferencia"       // interna, sem forma detalhada
  | "outro";

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Classifica um lançamento pela descrição + forma de pagamento.
 * Regras aplicadas em ordem: a primeira que casa vence.
 */
export function classifyRowKind(
  description?: string | null,
  payment_method?: string | null,
  category?: string | null,
): RowKind {
  const text = `${norm(description)} ${norm(category)} ${norm(payment_method)}`.trim();
  if (!text) return "outro";

  // -- cartão de crédito ---------------------------------------------------
  // Pagamento da fatura (fluxo bancário, saída) vem antes das compras porque
  // o texto costuma conter "fatura" + "cartao".
  if (/pagamento\s+(?:da\s+)?fatura|pgto\s+fatura|fatura\s+cart[aã]o|liquida[cç][aã]o\s+fatura/.test(text))
    return "cartao_fatura";
  if (/\bfatura\b/.test(text) && /cart[aã]o|credito/.test(text)) return "cartao_fatura";
  if (/cart[aã]o\s+de\s+cr[eé]dito|cartao\s+cred|compra\s+cart[aã]o|parcel[ao]\s+\d+\/\d+|\bccr\b/.test(text))
    return "cartao_credito";
  if (/credito\s+(?:a\s+vista|parcelado)/.test(text)) return "cartao_credito";

  // -- pix -----------------------------------------------------------------
  if (/\bpix\b/.test(text)) return "pix";

  // -- transferências bancárias -------------------------------------------
  if (/\bted\b|\bdoc\b|transfer[eê]ncia\s+banc/.test(text)) return "ted_doc";
  if (/transferencia|transf\b/.test(text)) return "transferencia";

  // -- boleto --------------------------------------------------------------
  if (/boleto|c[oó]d(?:igo)?\s*de\s*barras|cobran[cç]a\s+banc/.test(text))
    return "boleto";

  // -- débito --------------------------------------------------------------
  if (/cart[aã]o\s+de\s+d[eé]bito|debito\s+em\s+conta|compra\s+d[eé]bito|d[eé]bito\s+autom/.test(text))
    return "debito";

  // -- caixa ---------------------------------------------------------------
  if (/\bsaque\b|retirada|withdraw/.test(text)) return "saque";
  if (/dep[oó]sito|deposit\b/.test(text)) return "deposito";

  // -- tarifas / rendimentos ----------------------------------------------
  if (/tarifa|taxa\s+banc|anuidade|iof\b/.test(text)) return "tarifa";
  if (/rendimento|remunera[cç][aã]o|juros\s+(?:credit|remuner)/.test(text))
    return "rendimento";
  if (/investimento|aplica[cç][aã]o|resgate|cdb\b|tesouro\b|fundo\s+de|renda\s+fixa|a[cç][oõ]es\b/.test(text))
    return "investimento";

  return "outro";
}

/** True para transações que NÃO devem participar do cruzamento comum. */
export function isCardKind(kind?: string | null): boolean {
  return kind === "cartao_credito" || kind === "cartao_fatura";
}

/**
 * Detector determinístico de lançamento de cartão de crédito, usado tanto pelo
 * filtro da conferência quanto pelas ações em massa no servidor.
 * Usa somente campos oficiais da linha (nada de sugestões de IA).
 */
export function isCreditCardRow(row: {
  kind?: string | null;
  payment_method?: string | null;
  card?: string | null;
  card_last4?: string | null;
  description?: string | null;
  category?: string | null;
}): boolean {
  if (isCardKind(row.kind)) return true;
  if (row.card && String(row.card).trim()) return true;
  if (row.card_last4 && String(row.card_last4).trim()) return true;
  const method = norm(row.payment_method);
  if (/credito|cart[aã]o/.test(method)) return true;
  return isCardKind(
    classifyRowKind(row.description ?? null, row.payment_method ?? null, row.category ?? null),
  );
}

/** Rótulo humano em pt-BR. */
export const ROW_KIND_LABEL: Record<RowKind, string> = {
  cartao_credito: "Cartão de crédito",
  cartao_fatura: "Pagamento de fatura",
  pix: "Pix",
  ted_doc: "TED/DOC",
  boleto: "Boleto",
  debito: "Débito",
  saque: "Saque",
  deposito: "Depósito",
  tarifa: "Tarifa",
  rendimento: "Rendimento",
  investimento: "Investimento",
  transferencia: "Transferência",
  outro: "Outros",
};