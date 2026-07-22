export const currencyBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// -----------------------------------------------------------------------------
// Padrão brasileiro de valores monetários
//   - vírgula = separador decimal
//   - ponto   = separador de milhar
//   - "R$ 1.880,00" → 1880.00 (nunca 1.88, nunca 1880*100)
//   - "R$ 15,11"    → 15.11   (nunca 1511)
// O valor numérico é sempre positivo; a natureza (Despesa/Investimento) fica
// no campo `transaction_type`, nunca representada pelo sinal.
// -----------------------------------------------------------------------------
export function parseBrlAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.abs(raw);
  let s = String(raw).trim();
  if (!s) return null;
  
  // Remove R$, espaços e lixo, mantendo dígitos, vírgula, ponto e sinais básicos
  s = s.replace(/R\$/gi, "").replace(/\s+/g, "").replace(/[^\d,.\-()]/g, "");
  if (!s) return null;
  
  s = s.replace(/^\(([^)]*)\)$/, "-$1");
  const isNegative = s.startsWith("-");
  s = s.replace(/^-/, "");
  
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  
  if (hasComma && hasDot) {
    // Caso padrão: "1.234,56" -> 1234.56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "1234,56" -> 1234.56
    s = s.replace(",", ".");
  } else if (hasDot) {
    // Caso perigoso: "5.013" ou "17.63"
    // Em BRL, se só tem ponto, ele costuma ser separador de milhar.
    // Mas OCR pode ler "17,63" como "17.63".
    const parts = s.split(".");
    const lastPart = parts[parts.length - 1];
    
    // Se a última parte tem exatamente 3 dígitos, é quase certo que é milhar (ex: 1.000)
    if (parts.length > 1 && lastPart.length === 3) {
      s = parts.join("");
    } 
    // Se tem exatamente 2 dígitos, tratamos como decimal (ex: 17.63)
    else if (parts.length === 2 && lastPart.length === 2) {
      s = parts.join(".");
    }
    // Caso contrário (ex: 5.013 com 3 dígitos mas ponto único), tratamos como milhar
    else {
      s = parts.join("");
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  
  const result = isNegative ? -n : n;
  // Retornamos o valor absoluto pois o sistema usa transaction_type para sinal,
  // mas preservamos a precisão de centavos.
  return Math.abs(Math.round(result * 100) / 100);
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
  lixo: "Taxa de lixo",
  condominio: "Condomínio",
  agua: "Água e esgoto",
  energia: "Energia",
  internet: "Internet",
  limpeza: "Limpeza",
  gas: "Gás",
  outro: "Outra",
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
  unica: "Única",
  outro: "Outro",
};
