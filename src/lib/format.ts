export const currencyBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Função central de parsing monetário para centavos.
 * NUNCA use floats para comparações financeiras.
 * parseMoneyToCents("R$ 5.013,00") === 501300
 * parseMoneyToCents("R$ 5,01") === 501
 */
export function parseMoneyToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  
  // Se for número, tratamos preservando o sinal
  if (typeof raw === "number") {
    return Math.round(raw * 100);
  }

  let s = String(raw).trim();
  if (!s) return null;

  // Detecta se é negativo ANTES de limpar (para suportar "- R$ 10,00" ou "(10,00)")
  const cleanedForSign = s.replace(/\s+/g, "");
  const isNegative = cleanedForSign.startsWith("-") || 
                     (cleanedForSign.startsWith("(") && cleanedForSign.endsWith(")"));

  // Limpa tudo exceto dígitos, vírgula e ponto
  s = s.replace(/R\$/gi, "").replace(/[^\d,.]/g, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Caso padrão: "1.234,56" -> 123456
    s = s.replace(/\./g, "").replace(",", "");
  } else if (hasComma) {
    // "1234,56" -> 123456
    s = s.replace(",", "");
  } else if (hasDot) {
    // Caso perigoso: "5.013" ou "17.63"
    const parts = s.split(".");
    const lastPart = parts[parts.length - 1];

    // Em BRL, se só tem ponto e a última parte tem 2 dígitos, é decimal (ex: 17.63)
    if (parts.length === 2 && lastPart.length === 2) {
      s = parts.join("");
    }
    // Se tem 3 dígitos ou mais de um ponto, é milhar
    else {
      s = parts.join("") + "00";
    }
  } else {
    // Sem separadores: "1234" -> 123400
    s = s + "00";
  }

  let n = parseInt(s, 10);
  if (Number.isNaN(n)) return null;

  return isNegative ? -Math.abs(n) : Math.abs(n);
}

/** @deprecated Use parseMoneyToCents instead for accuracy */
export function parseBrlAmount(raw: unknown): number | null {
  const cents = parseMoneyToCents(raw);
  return cents !== null ? cents / 100 : null;
}

/**
 * Extrai todos os valores monetários de um texto (OCR / PDF) preservando o
 * token original. Evita a concatenação de dois valores vizinhos
 * ("R$ 15.987,66 100,00" → dois tokens, nunca um só).
 */
export function extractMoneyTokens(text: unknown): string[] {
  const s = String(text ?? "");
  if (!s) return [];
  const re = /-?\s*R?\$?\s*\d{1,3}(?:\.\d{3})+,\d{2}|-?\s*R?\$?\s*\d+,\d{2}/g;
  return (s.match(re) ?? []).map((t) => t.trim());
}

/**
 * Parsing monetário para valores vindos de OCR, onde os separadores podem ter
 * sido perdidos ("R$ 2.331,64" lido como "R$ 233164").
 *
 * Regra determinística:
 * - com vírgula ou ponto decimal → usa o parser BRL normal;
 * - sem separador algum e com 5+ dígitos → os dois últimos dígitos são os
 *   centavos (contexto de OCR que removeu os separadores);
 * - sem separador e com até 4 dígitos → valor inteiro em reais.
 *
 * Nunca multiplica por 100 um valor que já está em centavos.
 */
export function parseOcrMoneyToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Math.round(raw * 100);

  const s = String(raw).trim();
  if (!s) return null;

  // Texto com mais de um valor: usa o primeiro token monetário completo.
  const tokens = extractMoneyTokens(s);
  if (tokens.length > 0) return parseMoneyToCents(tokens[0]);

  const compact = s.replace(/\s+/g, "");
  const negative = compact.startsWith("-") || (compact.startsWith("(") && compact.endsWith(")"));
  const cleaned = s.replace(/R\$/gi, "").replace(/[^\d,.]/g, "");
  if (!cleaned) return null;

  if (!cleaned.includes(",") && !cleaned.includes(".")) {
    const n = parseInt(cleaned, 10);
    if (Number.isNaN(n)) return null;
    const cents = cleaned.length >= 5 ? n : n * 100;
    return negative ? -cents : cents;
  }

  return parseMoneyToCents(raw);
}

/** Comparação financeira canônica: magnitude em centavos inteiros. */
export function sameMagnitudeCents(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  return Math.abs(a) === Math.abs(b);
}

/**
 * Nome canônico da função central de parsing monetário brasileiro.
 * Interpreta "1.250.000,00", "1.250,50", "0,50", "-400,00", "R$ 12,00",
 * valores com espaços e valores entre parênteses (negativos).
 * Retorna centavos inteiros (nunca float) ou null.
 */
export const parseBrlAmountToCents = parseMoneyToCents;

/** Converte centavos inteiros para o número decimal usado nas colunas numeric. */
export function centsToNumber(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null;
  return cents / 100;
}

export function formatBrlNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  return Math.abs(Number(n)).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const dateBR = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = v.split("-");
    return `${d}/${m}/${y}`;
  }
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

export const propertyTypeLabel: Record<string, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  terreno: "Terreno",
  sala_comercial: "Sala comercial",
  galpao: "Galpão",
  fazenda: "Fazenda",
  predio: "Prédio",
  lote: "Lote",
  terreno_urbano: "Terreno urbano",
  terreno_rural: "Terreno rural",
  outro: "Outro",
};

export const propertyStatusLabel: Record<string, string> = {
  proprio: "Próprio",
  alugado: "Alugado",
  em_reforma: "Em reforma",
  vendido: "Vendido",
  em_aquisicao: "Em aquisição",
  em_inventario: "Em inventário",
  arquivado: "Arquivado",
  desocupado: "Desocupado",
  em_uso_familiar: "Em uso familiar",
  comodato: "Cedido em comodato",
  a_venda: "À venda",
  em_leilao: "Em leilão",
  documentacao_pendente: "Documentação pendente",
  outro: "Outro",
};

export const propertyPurposeLabel: Record<string, string> = {
  moradia: "Moradia",
  aluguel: "Aluguel",
  venda: "Venda",
  investimento: "Investimento",
  uso_empresarial: "Uso empresarial",
  rural: "Rural",
  outro: "Outro",
};

export const taskStatusLabel: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  aguardando_terceiros: "Aguardando terceiros",
};

export const taskPriorityLabel: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const obligationKindLabel: Record<string, string> = {
  iptu: "IPTU",
  itbi: "ITBI",
  lixo: "Taxa de lixo",
  condominio: "Condomínio",
  agua: "Água",
  energia: "Energia elétrica",
  gas: "Gás",
  seguro: "Seguro do imóvel",
  aluguel: "Aluguel",
  financiamento: "Financiamento",
  associacao: "Taxa de associação",
  internet: "Internet",
  telefone: "Telefone",
  manutencao: "Manutenção recorrente",
  taxa_municipal: "Taxa municipal",
  taxa_estadual: "Taxa estadual",
  taxa_federal: "Taxa federal",
  outro: "Outra obrigação",
};

export const obligationStatusLabel: Record<string, string> = {
  em_dia: "Em dia",
  pendente: "Pendente",
  atrasado: "Atrasado",
  pago: "Pago",
  cancelado: "Cancelado",
};

export const periodicityLabel: Record<string, string> = {
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  unica: "Parcela única",
  personalizada: "Personalizada",
  sem_recorrencia: "Sem recorrência definida",
  outro: "Outro",
};
