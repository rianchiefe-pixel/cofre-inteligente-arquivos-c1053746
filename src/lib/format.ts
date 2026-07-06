export const currencyBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dateBR = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

export const profileTypeLabel: Record<string, string> = {
  pessoa_fisica: "Pessoa Física",
  empresa: "Empresa",
  holding: "Holding",
  imovel: "Imóvel",
  projeto: "Projeto",
  outro: "Outro",
};

export const accountTypeLabel: Record<string, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
  pj: "PJ",
  investimento: "Investimento",
  cartao: "Cartão",
  carteira_digital: "Carteira Digital",
  outro: "Outro",
};

export const transactionTypeLabel: Record<string, string> = {
  despesa: "Despesa",
  investimento: "Investimento",
  gasto_fixo: "Gasto Fixo",
  gasto_variavel: "Gasto Variável",
  pessoal: "Pessoal",
  empresarial: "Empresarial",
  patrimonial: "Patrimonial",
};

export const paymentMethodLabel: Record<string, string> = {
  debito: "Débito",
  credito_vista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
  pix: "Pix",
  ted: "TED",
  boleto: "Boleto",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  outro: "Outro",
};
