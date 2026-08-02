/**
 * Motor determinístico de organização dos lançamentos da Advocacia Liliane Pereira.
 *
 * Regras estruturais:
 * - só usa evidência ORIGINAL do lançamento (favorecido, descrição, observações,
 *   nome do arquivo, banco, documento e texto do comprovante). Nunca campos ai_*.
 * - não decide nada sobre perfil: a filtragem por perfil acontece no servidor/RPC.
 */

export const ADVOCACIA_COST_CENTER = "Advocacia Liliane Pereira";
export const ADVOCACIA_RULE_NAME = "Advocacia Liliane Pereira — classificação automática";

export type Confidence = "high" | "medium" | "low";

/** Estrutura oficial de categorias/subcategorias da advocacia. */
export const ADVOCACIA_TAXONOMY: { parent: string; children: string[] }[] = [
  {
    parent: "Receitas da advocacia",
    children: [
      "Honorários advocatícios",
      "Consultorias jurídicas",
      "Contratos mensais",
      "Honorários de êxito",
      "Reembolsos de clientes",
      "Outras receitas jurídicas",
    ],
  },
  {
    parent: "Despesas processuais",
    children: [
      "Custas judiciais",
      "Taxas processuais",
      "Emolumentos",
      "Cartórios",
      "Certidões",
      "Diligências",
      "Correspondentes jurídicos",
      "Perícias",
      "Deslocamentos processuais",
    ],
  },
  {
    parent: "Pessoal e prestadores",
    children: [
      "Advogados",
      "Estagiários",
      "Assistentes",
      "Correspondentes",
      "Serviços terceirizados",
      "Pró-labore",
      "Salários",
      "Encargos",
    ],
  },
  {
    parent: "Estrutura do escritório",
    children: [
      "Aluguel",
      "Condomínio",
      "Energia",
      "Água",
      "Internet e telefone",
      "Material de escritório",
      "Limpeza",
      "Manutenção",
      "Móveis e equipamentos",
      "Informática",
    ],
  },
  {
    parent: "Serviços profissionais",
    children: [
      "Contabilidade",
      "Consultoria",
      "Marketing",
      "Publicidade",
      "Sistemas jurídicos",
      "Certificado digital",
      "Assinaturas e licenças",
    ],
  },
  {
    parent: "Tributos e obrigações",
    children: [
      "Impostos",
      "Taxas municipais",
      "Taxas estaduais",
      "Taxas federais",
      "OAB",
      "Registros",
      "Multas e juros",
    ],
  },
  {
    parent: "Bancos e meios de pagamento",
    children: [
      "Tarifas bancárias",
      "Juros",
      "IOF",
      "Cartão de crédito",
      "Taxas de cobrança",
      "Plataformas de pagamento",
    ],
  },
  {
    parent: "Imóveis",
    children: [
      "Aluguel recebido",
      "Condomínio",
      "IPTU",
      "Energia",
      "Água",
      "Manutenção",
      "Reforma",
      "Móveis",
      "Documentação",
      "Registro e escritura",
    ],
  },
];

export type OrganizerReceipt = {
  id: string;
  recipient_name?: string | null;
  recipient_tax_id?: string | null;
  description?: string | null;
  notes?: string | null;
  file_name?: string | null;
  bank_name?: string | null;
  auth_code?: string | null;
  amount?: number | string | null;
  payment_date?: string | null;
  category_id?: string | null;
  property_id?: string | null;
  cost_center_id?: string | null;
  ocr_text?: string | null;
};

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Concatena somente evidências originais (nunca sugestões de IA). */
export function receiptEvidence(receipt: OrganizerReceipt): string {
  return normalizeText(
    [
      receipt.recipient_name,
      receipt.recipient_tax_id,
      receipt.description,
      receipt.notes,
      receipt.file_name,
      receipt.bank_name,
      receipt.ocr_text,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}

type Weight = "identity" | "strong" | "weak";

type TermRule = {
  term: string;
  weight: Weight;
  parent: string;
  child: string;
};

/** Termos de identificação e classificação. Ordem = prioridade de categoria. */
export const ADVOCACIA_TERMS: TermRule[] = [
  { term: "advocacia liliane pereira", weight: "identity", parent: "Receitas da advocacia", child: "Outras receitas jurídicas" },
  { term: "liliane pereira", weight: "identity", parent: "Receitas da advocacia", child: "Outras receitas jurídicas" },
  { term: "escritorio de advocacia", weight: "identity", parent: "Estrutura do escritório", child: "Aluguel" },
  { term: "honorarios de exito", weight: "strong", parent: "Receitas da advocacia", child: "Honorários de êxito" },
  { term: "honorarios advocaticios", weight: "strong", parent: "Receitas da advocacia", child: "Honorários advocatícios" },
  { term: "honorarios", weight: "weak", parent: "Receitas da advocacia", child: "Honorários advocatícios" },
  { term: "consultoria juridica", weight: "strong", parent: "Receitas da advocacia", child: "Consultorias jurídicas" },
  { term: "custas processuais", weight: "strong", parent: "Despesas processuais", child: "Custas judiciais" },
  { term: "custas judiciais", weight: "strong", parent: "Despesas processuais", child: "Custas judiciais" },
  { term: "taxas judiciais", weight: "strong", parent: "Despesas processuais", child: "Taxas processuais" },
  { term: "taxa judiciaria", weight: "strong", parent: "Despesas processuais", child: "Taxas processuais" },
  { term: "emolumento", weight: "strong", parent: "Despesas processuais", child: "Emolumentos" },
  { term: "correspondente juridico", weight: "strong", parent: "Despesas processuais", child: "Correspondentes jurídicos" },
  { term: "diligencia", weight: "strong", parent: "Despesas processuais", child: "Diligências" },
  { term: "pericia", weight: "strong", parent: "Despesas processuais", child: "Perícias" },
  { term: "tribunal", weight: "strong", parent: "Despesas processuais", child: "Custas judiciais" },
  { term: "forum", weight: "strong", parent: "Despesas processuais", child: "Custas judiciais" },
  { term: "oab", weight: "strong", parent: "Tributos e obrigações", child: "OAB" },
  { term: "cartorio", weight: "weak", parent: "Despesas processuais", child: "Cartórios" },
  { term: "certidao", weight: "weak", parent: "Despesas processuais", child: "Certidões" },
  { term: "registro eletronico de imoveis", weight: "weak", parent: "Imóveis", child: "Registro e escritura" },
  { term: "certificado digital", weight: "weak", parent: "Serviços profissionais", child: "Certificado digital" },
  { term: "sistema juridico", weight: "weak", parent: "Serviços profissionais", child: "Sistemas jurídicos" },
  { term: "sistemas juridicos", weight: "weak", parent: "Serviços profissionais", child: "Sistemas jurídicos" },
  { term: "processo", weight: "weak", parent: "Despesas processuais", child: "Taxas processuais" },
];

export type AdvocaciaSuggestion = {
  receiptId: string;
  matched: boolean;
  confidence: Confidence;
  categoryParent: string | null;
  categoryChild: string | null;
  matchedTerms: string[];
  reason: string;
  propertyHint: string | null;
};

/** Extrai um endereço utilizável como nome de imóvel; null quando não há confiança. */
export function extractPropertyHint(evidence: string): string | null {
  const match = evidence.match(
    /\b(rua|avenida|av|alameda|travessa|rodovia|praca)\b\.?\s+([a-z0-9\s.]{3,40}?),?\s*(?:n[o°º]?\s*)?(\d{1,5})\b/,
  );
  if (!match) return null;
  const street = match[2].replace(/\s+/g, " ").trim();
  if (street.length < 3) return null;
  const kind = match[1] === "av" ? "avenida" : match[1];
  return `${kind} ${street}, ${match[3]}`;
}

function titleize(value: string): string {
  return value
    .split(" ")
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Classifica um lançamento. `matched: false` = sem evidência (não alterar). */
export function classifyAdvocaciaReceipt(receipt: OrganizerReceipt): AdvocaciaSuggestion {
  const evidence = receiptEvidence(receipt);
  const hits = ADVOCACIA_TERMS.filter((rule) => evidence.includes(rule.term));

  if (hits.length === 0) {
    return {
      receiptId: receipt.id,
      matched: false,
      confidence: "low",
      categoryParent: null,
      categoryChild: null,
      matchedTerms: [],
      reason: "Sem evidência da advocacia no lançamento original",
      propertyHint: null,
    };
  }

  const identity = hits.filter((h) => h.weight === "identity");
  const strong = hits.filter((h) => h.weight === "strong");
  const weak = hits.filter((h) => h.weight === "weak");

  let confidence: Confidence;
  if (identity.length > 0 || (strong.length > 0 && hits.length > 1)) confidence = "high";
  else if (strong.length > 0 || weak.length > 1) confidence = "medium";
  else confidence = "low";

  // A categoria vem do termo mais específico disponível (forte > identidade > fraco).
  const chosen = strong[0] ?? identity[0] ?? weak[0];
  const parts: string[] = [];
  if (identity.length > 0) parts.push(`identificação: ${identity.map((h) => h.term).join(", ")}`);
  if (strong.length > 0) parts.push(`atividade jurídica: ${strong.map((h) => h.term).join(", ")}`);
  if (weak.length > 0) parts.push(`indícios: ${weak.map((h) => h.term).join(", ")}`);

  return {
    receiptId: receipt.id,
    matched: true,
    confidence,
    categoryParent: chosen.parent,
    categoryChild: chosen.child,
    matchedTerms: hits.map((h) => h.term),
    reason: parts.join(" · "),
    propertyHint: extractPropertyHint(evidence),
  };
}

/** Nome amigável para um imóvel criado a partir de endereço detectado. */
export function propertyNameFromHint(hint: string): string {
  return titleize(hint);
}

/** Encontra imóvel existente equivalente ao endereço detectado (evita duplicidade). */
export function findExistingProperty(
  hint: string,
  properties: { id: string; name: string; address?: string | null; registration?: string | null }[],
): { id: string; name: string } | null {
  const target = normalizeText(hint);
  const digits = target.match(/\d{1,5}/)?.[0] ?? "";
  for (const property of properties) {
    const haystack = normalizeText([property.name, property.address, property.registration].filter(Boolean).join(" "));
    if (!haystack) continue;
    if (haystack.includes(target) || target.includes(haystack)) return { id: property.id, name: property.name };
    const street = target.replace(/,?\s*\d{1,5}$/, "").replace(/^(rua|avenida|alameda|travessa|rodovia|praca)\s+/, "");
    if (street.length > 4 && haystack.includes(street) && (!digits || haystack.includes(digits))) {
      return { id: property.id, name: property.name };
    }
  }
  return null;
}

/** Nomes de categorias que a organização pode precisar criar. */
export function taxonomyPairs(): { parent: string; child: string }[] {
  return ADVOCACIA_TAXONOMY.flatMap((group) => group.children.map((child) => ({ parent: group.parent, child })));
}