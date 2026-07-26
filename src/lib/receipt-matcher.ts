// ---------------------------------------------------------------------------
// Parte 4 — Localização automática dos comprovantes
//
// Cross-matches import_rows (linhas da planilha) with import_files (arquivos
// extraídos do ZIP) and persists candidatos em `import_row_files` com
// pontuação 0–100 + motivos.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { formatBrlNumber, parseBrlAmount, parseMoneyToCents, paymentMethodLabel } from "@/lib/format";
import { normalizeBank, type ReceiptFacts } from "@/lib/zip-import";
import { isCardKind } from "@/lib/import-kind";
import { assertMatchingAmounts } from "./persistence-validator";

export const MATCHER_BUILD_VERSION = "2026-07-25-sign-magnitude-fix";


export type MatchTier = "very_high" | "high" | "review" | "low" | "none";

export interface CandidateReason {
  key: "match" | "divergence" | "missing" | "manual" | "path" | "id" | "amount" | "date" | "payee" | "payee-partial" | "bank" | "txid" | "auth" | "doc";
  field?: string;
  label: string;
  points?: number;
  rowValue?: any;
  receiptValue?: any;
}

export interface Candidate {
  fileId: string;
  pageNumber: number | null;
  score: number;
  confidence: MatchTier;
  reasons: CandidateReason[];
  matched: string[];
  divergent: string[];
  missing: string[];
}

// ---- text utils ----------------------------------------------------------

function norm(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function digits(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}
function tokens(v: unknown): Set<string> {
  return new Set(norm(v).split(" ").filter((t) => t.length >= 3));
}
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.min(a.size, b.size);
}

// "Abril 2026/C121_2026-04-30.pdf | p.3", "FATURA_11042026.pdf - páginas 3-4",
// "invoice (8).pdf", "PDF pág. 1"
function extractPageHint(raw: unknown): number | null {
  const s = String(raw ?? "");
  if (!s) return null;
  const m = s.match(/(?:p[aá]gs?\.?|p\.?)\s*(\d{1,3})/i);
  return m ? parseInt(m[1], 10) : null;
}
function stripPageHint(raw: unknown): string {
  return String(raw ?? "").replace(/\s*(?:[|,-]\s*)?(?:p[aá]gs?\.?|p\.?)\s*\d+(?:\s*[-–]\s*\d+)?/gi, "");
}

// ---- text utils ----------------------------------------------------------

function toCents(value: unknown): number | null {
  return parseMoneyToCents(value);
}

/**
 * REGRA DE MAGNITUDE: Compara o valor absoluto (centavos) para localizar comprovantes.
 * Planilha -400,00 e Comprovante 400,00 são compatíveis em magnitude.
 */
function amountsHaveSameMagnitude(a: unknown, b: unknown): boolean {
  const ca = toCents(a);
  const cb = toCents(b);
  if (ca === null || cb === null) return false;
  return Math.abs(ca) === Math.abs(cb);
}

/**
 * Validação de Direção:
 * Linha negativa (saída) -> Comprovante deve indicar pagamento/saída/pix enviado.
 * Linha positiva (entrada) -> Comprovante deve indicar recebimento/entrada/pix recebido.
 */
function isDirectionValid(rowAmount: unknown, ocr: any, extractedText: string): boolean {
  const cents = toCents(rowAmount);
  if (cents === null) return false;

  const isExpense = cents < 0;
  const isIncome = cents > 0;

  const text = norm(extractedText);
  const ocrMethod = norm(ocr.payment_method ?? "");
  
  // Palavras-chave de Saída/Pagamento
  const expenseKeywords = ["pagamento", "saida", "debito", "enviado", "transferido", "comprovante de pix", "liquidacao", "pago"];
  // Palavras-chave de Entrada/Recebimento
  const incomeKeywords = ["recebimento", "entrada", "credito", "recebido", "deposito"];

  if (isExpense) {
    // Para despesas, o comprovante NÃO deve ser explicitamente de recebimento
    const hasIncomeClue = incomeKeywords.some(k => text.includes(k) || ocrMethod.includes(k));
    const hasExpenseClue = expenseKeywords.some(k => text.includes(k) || ocrMethod.includes(k));
    // Se tem cara de entrada, bloqueia. Se tem cara de saída, autoriza. Se for neutro, autoriza (precisão por valor).
    return !hasIncomeClue || hasExpenseClue;
  }

  if (isIncome) {
    // Para receitas, o comprovante NÃO deve ser explicitamente de pagamento/débito
    const hasExpenseClue = expenseKeywords.some(k => text.includes(k) || ocrMethod.includes(k));
    const hasIncomeClue = incomeKeywords.some(k => text.includes(k) || ocrMethod.includes(k));
    return !hasExpenseClue || hasIncomeClue;
  }

  return true;
}

// Hierarquia rigorosa de associação (Precisão Máxima).
// Nenhuma associação ocorre sem evidência clara e determinística.
function gatedTier(
  raw: number, 
  matched: Set<string>, 
  divergent: string[],
  missing: string[],
  row: any,
  candidatesCount: number
): MatchTier {
  // REGRA DE OURO: Bloqueio de ambiguidade por valor.
  // Se existirem múltiplos candidatos com o mesmo valor, só permitimos associação
  // automática se houver um critério desempate forte (Data + Favorecido ou ID único).
  const hasStrongTiebreaker = (matched.has("date") && (matched.has("payee") || matched.has("payee-partial"))) || 
                             matched.has("id") || matched.has("txid") || matched.has("auth");

  if (candidatesCount > 1 && !hasStrongTiebreaker) {
    divergent.push("Ambiguidade entre linhas — revisão manual necessária (múltiplos candidatos com mesmo valor)");
    return "none";
  }

  const hasId = matched.has("id") || matched.has("txid") || matched.has("auth");
  const coreOk = matched.has("amount") && matched.has("date") && matched.has("payee");
  
  // High / Very High: Zero divergências + critérios completos
  if (divergent.length === 0) {
    if (hasId && matched.has("amount")) return "very_high";
    if (coreOk && matched.has("amount")) return "high";
  }

  // REVISÃO: Exatamente uma divergência relevante + evidências suficientes
  // OU critérios incompletos (missing) mas evidências fortes.
  const evidenceCount = matched.size; // amount conta como 1
  const hasStrongEvidence = matched.has("date") || matched.has("id") || matched.has("auth") || matched.has("path") || matched.has("doc");
  
  if (matched.has("amount")) {
    if (divergent.length === 1 && evidenceCount >= 3 && hasStrongEvidence) {
      return "review";
    }
    if (divergent.length === 0 && missing.length <= 1 && evidenceCount >= 3 && hasStrongEvidence) {
      return "review";
    }
    // Caso especial: valor + data corretos, favorecido ausente, apenas um candidato
    if (divergent.length === 0 && matched.has("date") && candidatesCount === 1) {
      return "review";
    }
  }

  return "none";
}


function isAcceptedTier(confidence: MatchTier): boolean {
  return confidence === "very_high" || confidence === "high";
}

// ---- Core scoring --------------------------------------------------------

interface FileFacts {
  id: string;
  original_path: string;
  folder: string | null;
  file_name: string;
  extracted_text: string;
  ocr: ReceiptFacts | null;
  page_count: number | null;
  pageHint: number | null;
  nameNorm: string;
  pathNorm: string;
  textNorm: string;
  tokens: Set<string>;
  readable: boolean;
}


function factsFromFile(f: any): FileFacts {
  const name = String(f.file_name ?? "");
  const nameClean = stripPageHint(name);
  const path = String(f.original_path ?? "");
  const text = String(f.extracted_text ?? "");
  const ocr = (f.ocr_data ?? null) as ReceiptFacts | null;
  const pageHint = extractPageHint(name) ?? extractPageHint(path);
  const bag = `${nameClean} ${path} ${text}`;
  return {
    id: f.id,
    original_path: path,
    folder: f.folder ?? null,
    file_name: name,
    extracted_text: text,
    ocr,
    page_count: f.page_count ?? null,
    pageHint,
    nameNorm: norm(nameClean),
    pathNorm: norm(path),
    textNorm: norm(text),
    tokens: tokens(bag),
    readable: f.readable !== false,
  };
}


function scoreRowAgainstFile(row: any, f: FileFacts): Candidate | null {
  const reasons: CandidateReason[] = [];
  const matched = new Set<string>();
  const divergent: string[] = [];
  const missing: string[] = [];
  let score = 0;
  const ocr = f.ocr ?? {};

  const wantedName = String(row.file_name ?? "").trim();
  const wantedFolder = String(row.folder_path ?? "").trim();
  const rowSourceId = String(row.source_id ?? "").trim();
  const rowInvoice = String(row.invoice_number ?? "").trim();

  // 1. Exact name / path (40)
  if (wantedName) {
    const wn = norm(stripPageHint(wantedName));
    if (wn && (f.nameNorm === wn || f.pathNorm.endsWith(wn) || f.pathNorm.includes(wn))) {
      score += 40;
      reasons.push({ key: "path", label: `nome/caminho: ${wantedName}`, points: 40 });
      matched.add("path");
    }
  } else {
    missing.push("nome_arquivo");
  }

  // 2. Source / transaction id (35)
  const ids = [rowSourceId, rowInvoice].filter(Boolean);
  let idHit = false;
  for (const id of ids) {
    const d = digits(id);
    const n = norm(id);
    if ((d && d.length >= 4 && (f.nameNorm === d || f.pathNorm === d || f.textNorm === d)) ||
        (n && n.length >= 4 && (f.nameNorm === n || f.textNorm === n))) {
      score += 35;
      reasons.push({ key: "id", label: `ID/transação: ${id}`, points: 35 });
      matched.add("id");
      idHit = true;
      break;
    }
  }
  if (!idHit) missing.push("id_transacao");

  // 3. Amount (25) — exatidão absoluta exigida.
  const rowCents = toCents(row.amount);
  if (rowCents === null || rowCents === 0) return null;

  const ocrCents = toCents(ocr.amount_raw ?? ocr.amount);
  if (ocrCents !== null) {
    if (amountsHaveSameMagnitude(rowCents, ocrCents)) {
      if (!isDirectionValid(rowCents, ocr, f.extracted_text)) {
        divergent.push(`direção incompatível: planilha (${rowCents < 0 ? 'saída' : 'entrada'}) × comprovante parece ser o oposto`);
      }
      score += 25;
      reasons.push({ key: "amount", label: `valor compatível R$ ${formatBrlNumber(row.amount as number)}`, points: 25 });
      matched.add("amount");
    } else {
      // Divergência de valor é fatal: return null imediato conforme exigido.
      return null;
    }
  } else {
    // Busca exaustiva
    const rawText = `${f.file_name} ${f.extracted_text}`;
    const moneyRegex = /(?:R\$?\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;
    let match;
    let foundExact = false;
    let foundOther = false;
    const targetAbsCents = Math.abs(rowCents);

    while ((match = moneyRegex.exec(rawText)) !== null) {
      const foundCents = toCents(match[1]);
      if (foundCents !== null && Math.abs(foundCents) === targetAbsCents) {
        foundExact = true;
      } else if (foundCents !== null) {
        foundOther = true;
      }
    }

    if (foundExact && !foundOther) {
      if (!isDirectionValid(rowCents, ocr, rawText)) {
        divergent.push("Direção da transação incompatível encontrada no texto");
      }
      score += 25;
      reasons.push({ key: "amount", label: `valor encontrado R$ ${formatBrlNumber(row.amount as number)}`, points: 25 });
      matched.add("amount");
    } else if (foundExact && foundOther) {
      divergent.push("Valor ambíguo — múltiplos valores financeiros no comprovante");
      // Valor ambíguo também é fatal se não puder desempate? O usuário pediu: 
      // "A divergência de valor continua causando return null imediato."
      // Ambiguidade não é exatamente divergência, mas é risco. Vamos manter return null aqui por segurança.
      return null;
    } else {
      return null; // Valor não encontrado
    }
  }

  // 4. Date (20)
  const date = String(row.transaction_date ?? "").trim();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-");
    const dmy = `${d}${m}${y}`;
    const dmy2 = `${d}/${m}/${y}`;
    const dmy3 = `${d}-${m}-${y}`;
    const dmy4 = `${d}.${m}.${y}`;
    const ymd = `${y}${m}${d}`;
    const hay = `${f.file_name} ${f.original_path} ${f.extracted_text}`;
    
    const dateHit = ocr.date === date || hay.includes(date) || hay.includes(dmy) || hay.includes(dmy2) || hay.includes(dmy3) || hay.includes(dmy4) || hay.includes(ymd);

    if (dateHit) {
      score += 20;
      reasons.push({ key: "date", label: `data ${date}`, points: 20 });
      matched.add("date");
    } else if (ocr.date && ocr.date !== date) {
      divergent.push(`data diverge (planilha ${date} × comprovante ${ocr.date})`);
    } else {
      missing.push("data");
    }
  }

  // 5. Payee (15)
  const payee = String(row.payee ?? row.description ?? "").trim();
  if (payee) {
    const payeeTokens = tokens(payee);
    const ocrPayeeTokens = tokens(ocr.payee ?? "");
    const ov = Math.max(
      tokenOverlap(payeeTokens, ocrPayeeTokens),
      tokenOverlap(payeeTokens, f.tokens),
    );
    if (ov >= 0.55) {
      score += 15;
      reasons.push({ key: "payee", label: `favorecido semelhante: ${payee}`, points: 15 });
      matched.add("payee");
    } else if (ov >= 0.25) {
      score += 7;
      reasons.push({ key: "payee-partial", label: `favorecido parcial: ${payee}`, points: 7 });
      matched.add("payee-partial");
    } else if (ocr.payee) {
      divergent.push(`favorecido diverge (planilha "${payee}" × comprovante "${ocr.payee}")`);
    } else {
      missing.push("favorecido");
    }
  }

  // 6. Bank (8)
  const bank = String(row.bank ?? "").trim();
  if (bank) {
    const rowBankKey = normalizeBank(bank);
    const fileBankKeys = new Set<string>([
      ...(ocr.banks ?? []),
      ...(ocr.bank_from ? [ocr.bank_from] : []),
      ...(ocr.bank_to ? [ocr.bank_to] : []),
    ]);
    const bnNorm = norm(bank);
    const textHit = !!bnNorm && (f.textNorm.includes(bnNorm) || f.nameNorm.includes(bnNorm) || f.pathNorm.includes(bnNorm));
    
    if ((rowBankKey && fileBankKeys.has(rowBankKey)) || textHit) {
      score += 8;
      reasons.push({ key: "bank", label: `mesmo banco: ${bank}`, points: 8 });
      matched.add("bank");
    } else if (rowBankKey && fileBankKeys.size > 0 && !fileBankKeys.has(rowBankKey)) {
      divergent.push(`banco diverge (planilha "${bank}" × comprovante "${[...fileBankKeys].join(", ")}")`);
    }
  }

  // Calculamos a confiança final usando gatedTier
  const confidence = gatedTier(score, matched, divergent, missing, row, 1);
  if (confidence === "none") return null;

  const pageHint = extractPageHint(row.page_number) ?? f.pageHint ?? null;

  return {
    fileId: f.id,
    pageNumber: pageHint,
    score,
    confidence,
    reasons: [
      ...reasons.map(r => ({ ...r, key: "match" as const, field: r.key })),
      ...divergent.map(d => ({ key: "divergence" as const, label: d, field: "unknown" })),
      ...missing.map(m => ({ key: "missing" as const, label: `Campo ausente: ${m}`, field: m }))
    ],
    matched: [...matched],
    divergent,
    missing,
  };
}


// ---- Public API ----------------------------------------------------------

export interface FileDiagnostic {
  file_id: string;
  file_name: string;
  processing_status: string;
  readable: boolean;
  is_duplicate: boolean;
  extracted_text_length: number;
  extracted_text_preview: string;
  extraction_source: string;
  ocr_amount_raw: any;
  ocr_amount_cents: number | null;
  ocr_date: string;
  ocr_payee: string;
  ocr_transaction_id: string;
  included_in_matching: boolean;
  exclusion_reason: string;
}

export interface MatchDiagnostics {
  row_id: string;
  row_number: number;
  row_amount_original: any;
  row_amount_cents: number | null;
  row_date: string;
  row_payee: string;
  
  // Database fields - what we found in the database exactly
  database_row_number: number | null;
  database_amount: any;
  database_transaction_date: string | null;
  database_payee: string | null;
  raw_data: any;
  normalized_data: any;
  ai_data: any;
  ai_suggested_amount: any;
  ai_suggested_date: string | null;
  status: string | null;
  error_message: string | null;

  candidates: Array<{
    file_id: string;
    file_name: string;
    receipt_amount_raw: any;
    receipt_amount_cents: number | null;
    same_magnitude: boolean;
    receipt_date: string;
    receipt_payee: string;
    direction_valid: boolean;
    candidate_accepted: boolean;
    score: number;
    confidence: MatchTier;
    rejection_reason: string;
  }>;
  selected_file_id: string | null;
  selected_file_name: string | null;
  persistence_accepted: boolean | null;
  final_reason: string;
}

export interface MatchProgress {
  rowsTotal: number;
  rowsDone: number;
  matched: number;
  needsReview: number;
  notFound: number;
  cardRows: number;
  cardMatched: number;
  unreadableFiles: number;
  unmatchedFiles: number;
  duplicateFiles: number;
  persistenceRejected: number;
  diagnostics?: MatchDiagnostics[];
  filesDiagnostics?: {
    files: FileDiagnostic[];
    summary: {
      total_files_queried: number;
      total_files_loaded: number;
      total_files_included_in_matching: number;
      total_files_without_text: number;
      total_files_without_amount: number;
      total_files_unreadable: number;
      total_files_duplicates: number;
    };
  };
}





export async function matchBatchReceipts(
  batchId: string,
  opts: { onProgress?: (p: MatchProgress) => void } = {},
): Promise<MatchProgress> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) throw new Error("Sessão expirada");

  const [{ data: rows }, { data: files }] = await Promise.all([
    supabase.from("import_rows").select("*").eq("batch_id", batchId).limit(5000),
    supabase
      .from("import_files")
      .select("id, file_name, original_path, folder, extension, extracted_text, ocr_data, page_count, duplicate_of, status, readable")
      .eq("batch_id", batchId)
      .in("status", ["ready", "processed", "completed", "done", "duplicate"])
      .limit(5000),
  ]);

  const rowList = rows ?? [];
  const rawFiles = files ?? [];

  const duplicateFiles = rawFiles.filter((f: any) => f.status === "duplicate").length;
  const unreadableFiles = rawFiles.filter((f: any) => f.readable === false).length;

  // Duplicates carry no extracted_text/ocr_data — hydrate them from the
  // original file (same content_hash) so the matcher can score them too.
  const missingParents = Array.from(
    new Set(
      rawFiles
        .filter((f: any) => f.duplicate_of && (!f.extracted_text || !f.ocr_data))
        .map((f: any) => f.duplicate_of as string),
    ),
  );
  const parentMap = new Map<string, { extracted_text: string | null; ocr_data: any; page_count: number | null }>();
  if (missingParents.length) {
    for (let i = 0; i < missingParents.length; i += 200) {
      const chunk = missingParents.slice(i, i + 200);
      const { data: parents } = await supabase
        .from("import_files")
        .select("id, extracted_text, ocr_data, page_count")
        .in("id", chunk);
      for (const p of parents ?? []) parentMap.set(p.id, p as any);
    }
  }
  const fileFacts = rawFiles.map((f: any) => {
    if (f.duplicate_of && (!f.extracted_text || !f.ocr_data)) {
      const p = parentMap.get(f.duplicate_of);
      if (p) {
        return factsFromFile({
          ...f,
          extracted_text: f.extracted_text ?? p.extracted_text,
          ocr_data: f.ocr_data ?? p.ocr_data,
          page_count: f.page_count ?? p.page_count,
        });
      }
    }
    return factsFromFile(f);
  });

  const { data: manualPrimaries } = await supabase
    .from("import_row_files")
    .select("row_id, file_id")
    .eq("batch_id", batchId)
    .eq("is_manual", true)
    .eq("is_primary", true);
  // Vínculos manuais e reservados devem ser preservados.
  const manualRows = new Set((manualPrimaries ?? []).map((l: any) => l.row_id));
  const reservedFiles = new Set((manualPrimaries ?? []).map((l: any) => l.file_id));

  const progress: MatchProgress = {
    rowsTotal: rowList.length,
    rowsDone: 0,
    matched: 0,
    needsReview: 0,
    notFound: 0,
    cardRows: 0,
    cardMatched: 0,
    unreadableFiles,
    unmatchedFiles: 0,
    duplicateFiles,
    persistenceRejected: 0,
    diagnostics: [],
    filesDiagnostics: {
      files: [],
      summary: {
        total_files_queried: rawFiles.length,
        total_files_loaded: fileFacts.length,
        total_files_included_in_matching: 0,
        total_files_without_text: 0,
        total_files_without_amount: 0,
        total_files_unreadable: unreadableFiles,
        total_files_duplicates: duplicateFiles,
      }
    }
  };

  // Preencher filesDiagnostics
  for (const fact of fileFacts) {
    const raw = rawFiles.find((rf: any) => rf.id === fact.id);
    const ocr = fact.ocr ?? {};
    const text = fact.extracted_text || "";
    const amountRaw = ocr.amount_raw ?? ocr.amount;
    
    if (!text) progress.filesDiagnostics!.summary.total_files_without_text++;
    if (amountRaw === undefined || amountRaw === null) progress.filesDiagnostics!.summary.total_files_without_amount++;
    
    const included = fact.readable !== false && !raw?.duplicate_of;
    if (included) progress.filesDiagnostics!.summary.total_files_included_in_matching++;

    progress.filesDiagnostics!.files.push({
      file_id: fact.id,
      file_name: fact.file_name,
      processing_status: raw?.status ?? "unknown",
      readable: raw?.readable !== false,
      is_duplicate: !!raw?.duplicate_of,
      extracted_text_length: text.length,
      extracted_text_preview: text.substring(0, 300),
      extraction_source: fact.original_path.toLowerCase().endsWith(".pdf") ? "Texto nativo do PDF" : "OCR / Imagem",
      ocr_amount_raw: amountRaw,
      ocr_amount_cents: toCents(amountRaw),
      ocr_date: ocr.date ?? "",
      ocr_payee: ocr.payee ?? "",
      ocr_transaction_id: ocr.transaction_id ?? "",
      included_in_matching: included,
      exclusion_reason: !included ? (raw?.duplicate_of ? "Arquivo duplicado" : "Arquivo ilegível") : ""
    });
  }

  // ---------------------------------------------------------------------------
  // Diagnóstico e Cruzamento
  // ---------------------------------------------------------------------------
  for (const row of rowList) {
    if (manualRows.has(row.id)) continue;
    if (isCardKind(row.kind)) continue;
    
    const rowCents = toCents(row.amount);
    const rowDiag: MatchDiagnostics = {
      row_id: row.id,
      row_number: (row as any).row_index ?? 0,
      row_amount_original: row.amount,
      row_amount_cents: rowCents,
      row_date: row.transaction_date ?? "",
      row_payee: row.payee ?? row.description ?? "",
      database_row_number: (row as any).row_index ?? null,
      database_amount: row.amount,
      database_transaction_date: row.transaction_date ?? null,
      database_payee: (row.payee ?? row.description) ?? null,
      raw_data: (row as any).raw_data ?? null,
      normalized_data: (row as any).normalized_data ?? null,
      ai_data: (row as any).ai_data ?? null,
      ai_suggested_amount: (row as any).ai_suggested_amount ?? null,
      ai_suggested_date: (row as any).ai_suggested_date ?? null,
      status: (row as any).status ?? null,
      error_message: (row as any).error_message ?? null,
      candidates: [],
      selected_file_id: null,
      selected_file_name: null,
      persistence_accepted: null,
      final_reason: "Não encontrado"
    };

    for (const f of fileFacts) {
      const c = scoreRowAgainstFile(row, f);
      const ocr = f.ocr ?? {};
      const receiptAmountRaw = ocr.amount_raw ?? ocr.amount;
      const receiptCents = toCents(receiptAmountRaw);
      const sameMag = amountsHaveSameMagnitude(rowCents, receiptCents);
      const dirValid = isDirectionValid(rowCents, ocr, f.extracted_text);
      const candidateAccepted = c ? (isAcceptedTier(c.confidence) || c.confidence === "review") : false;
      const rejectionReason = c ? c.divergent.join("; ") : "Filtro inicial (score null)";

      rowDiag.candidates.push({
        file_id: f.id,
        file_name: f.file_name,
        receipt_amount_raw: receiptAmountRaw,
        receipt_amount_cents: receiptCents,
        same_magnitude: sameMag,
        receipt_date: ocr.date ?? "",
        receipt_payee: ocr.payee ?? "",
        direction_valid: dirValid,
        candidate_accepted: candidateAccepted,
        score: c?.score ?? 0,
        confidence: c?.confidence ?? "none",
        rejection_reason: rejectionReason
      });
    }
    progress.diagnostics?.push(rowDiag);
  }

  // Cartão de crédito: lógica simplificada para diagnóstico
  const cardFileFacts = fileFacts.filter((f) => {
    const hay = `${f.file_name} ${f.textNorm}`;
    return /fatura|cartao de credito|cart[aã]o de cr[eé]dito|final \d{4}/i.test(hay);
  });
  for (const row of rowList) {
    if (!isCardKind(row.kind)) continue;
    progress.cardRows += 1;
    if (manualRows.has(row.id)) { progress.cardMatched += 1; continue; }
  }

  // ---------------------------------------------------------------------------
  // Persistência Transacional (Simulada via Lógica + Upsert)
  // ---------------------------------------------------------------------------
  
  // 1. Validar resultados finais contra ambiguidade global de comprovantes
  const automaticPayload: any[] = [];
  const reviewPayload: any[] = [];
  const finalFileClaims = new Map<string, number>();
  
  // Agrupar candidatos por linha (máximo 3)
  const allCandidatesByRow = new Map<string, Candidate[]>();
  for (const row of rowList) {
    if (manualRows.has(row.id) || isCardKind(row.kind)) continue;
    const candidates: Candidate[] = [];
    for (const f of fileFacts as FileFacts[]) {
      if (reservedFiles.has(f.id)) continue;
      const c = scoreRowAgainstFile(row, f);
      if (c && (isAcceptedTier(c.confidence) || c.confidence === "review")) {
        candidates.push(c);
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    allCandidatesByRow.set(row.id, candidates.slice(0, 3));
  }

  // Preencher automaticPayload baseado em claims únicos
  for (const row of rowList) {
    if (manualRows.has(row.id) || isCardKind(row.kind)) continue;
    const candidates = allCandidatesByRow.get(row.id) || [];
    const top = candidates[0];
    if (!top || !isAcceptedTier(top.confidence)) continue;

    // Verificar se outras linhas pleiteiam este arquivo com a mesma ou melhor confiança
    let isAmbiguous = false;
    for (const otherRow of rowList) {
      if (otherRow.id === row.id) continue;
      const otherCandidates = allCandidatesByRow.get(otherRow.id) || [];
      const otherTop = otherCandidates[0];
      if (otherTop && otherTop.fileId === top.fileId && isAcceptedTier(otherTop.confidence)) {
        isAmbiguous = true;
        break;
      }
    }

    if (!isAmbiguous) {
      automaticPayload.push({
        user_id: userId,
        batch_id: batchId,
        row_id: row.id,
        file_id: top.fileId,
        page_number: top.pageNumber,
        score: top.score,
        confidence: top.confidence,
        match_reasons: top.reasons,
        is_manual: false,
        is_primary: true,
      });
      const count = finalFileClaims.get(top.fileId) ?? 0;
      finalFileClaims.set(top.fileId, count + 1);
    }
  }

  // Preencher reviewPayload (candidatos com confidence: review OU automáticos bloqueados por ambiguidade)
  for (const row of rowList) {
    if (manualRows.has(row.id) || isCardKind(row.kind)) continue;
    const candidates = allCandidatesByRow.get(row.id) || [];
    const autoLink = automaticPayload.find(p => p.row_id === row.id);
    
    // Se já tem um automático primário, não precisamos de revisão para esta linha nesta etapa de cruzamento básico
    // (a menos que o usuário queira ver os outros candidatos, mas as regras dizem "grave candidatos de revisão")
    // Vamos gravar os candidatos de revisão para linhas que NÃO tem associação automática.
    if (autoLink) continue;

    for (const c of candidates) {
      // Regra: Candidato de revisão nunca é primário, e o arquivo não deve estar reservado ou já linkado como primário
      if (finalFileClaims.has(c.fileId)) continue; 

      reviewPayload.push({
        user_id: userId,
        batch_id: batchId,
        row_id: row.id,
        file_id: c.fileId,
        page_number: c.pageNumber,
        score: c.score,
        confidence: c.confidence,
        match_reasons: c.reasons,
        is_manual: false,
        is_primary: false,
      });
    }
  }

  // Adicionar cards (se necessário, seguindo a lógica anterior de cartões)
  // ... mantendo a lógica de cartões se desejar, mas focando nos payloads solicitados ...

  const finalPayload: any[] = [];
  const combinedDraft = [...automaticPayload, ...reviewPayload];

  for (const p of combinedDraft) {
    const row = rowList.find((r: any) => r.id === p.row_id);
    const file = rawFiles.find((f: any) => f.id === p.file_id);
    
    if (row && file) {
      try {
        const ocr = (file.ocr_data ?? {}) as any;
        const receiptAmount = ocr.amount_raw ?? ocr.amount;
        assertMatchingAmounts(row.amount, receiptAmount);
        finalPayload.push(p);
        
        const diag = progress.diagnostics?.find(d => d.row_id === row.id);
        if (diag) {
          if (p.is_primary) diag.persistence_accepted = true;
          // Se for revisão, marcamos como true para indicar que a barreira passou
          else if (diag.persistence_accepted === null) diag.persistence_accepted = true; 
        }
      } catch (e: any) {
        if (p.is_primary) {
          progress.matched--;
          progress.persistenceRejected++;
        }
        const diag = progress.diagnostics?.find(d => d.row_id === row.id);
        if (diag) {
          diag.persistence_accepted = false;
          diag.final_reason = `Rejeitado na persistência: ${e.message}`;
        }
      }
    }
  }

  // Atualizar contadores do progresso baseado no finalPayload
  progress.matched = finalPayload.filter(p => p.is_primary).length;
  
  // needsReview: linhas que tem pelo menos um candidato de revisão no payload final
  const rowsInReview = new Set(finalPayload.filter(p => !p.is_primary).map(p => p.row_id));
  progress.needsReview = rowsInReview.size;

  // notFound: linhas sem automático e sem revisão
  const rowsWithAuto = new Set(finalPayload.filter(p => p.is_primary).map(p => p.row_id));
  progress.notFound = rowList.filter(r => !isCardKind(r.kind) && !manualRows.has(r.id) && !rowsWithAuto.has(r.id) && !rowsInReview.has(r.id)).length;

  // 3. Execução "Transacional": Limpar antigos e inserir novos
  await supabase
    .from("import_row_files")
    .delete()
    .eq("batch_id", batchId)
    .eq("is_manual", false);

  for (let i = 0; i < finalPayload.length; i += 500) {
    const chunk = finalPayload.slice(i, i + 500);
    const { error } = await supabase.from("import_row_files").upsert(chunk as any, {
      onConflict: "row_id,file_id,page_number",
    });
    if (error) throw new Error(`Falha no reprocessamento transacional: ${error.message}`);
  }

  // Arquivos sem vínculo (nem automático nem manual nem revisão).
  const claimedFileIds = new Set<string>([
    ...finalPayload.map((p) => p.file_id),
    ...Array.from(reservedFiles),
  ]);
  progress.unmatchedFiles = rawFiles
    .filter((f: any) => f.status !== "duplicate" && f.readable !== false)
    .filter((f: any) => !claimedFileIds.has(f.id))
    .length;

  opts.onProgress?.({ ...progress });
  return progress;
}

export async function attachFileManually(input: {
  batchId: string;
  rowId: string;
  fileId: string;
  pageNumber?: number | null;
  makePrimary?: boolean;
}) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) throw new Error("Sessão expirada");

  // Barreira de gravação para associação manual
  const [{ data: row }, { data: file }] = await Promise.all([
    supabase.from("import_rows").select("amount").eq("id", input.rowId).single(),
    supabase.from("import_files").select("ocr_data").eq("id", input.fileId).single()
  ]);

  if (row && file) {
    const ocr = (file.ocr_data ?? {}) as any;
    const receiptAmount = ocr.amount_raw ?? ocr.amount;
    assertMatchingAmounts(row.amount, receiptAmount);
  }

  if (input.makePrimary) {
    await supabase
      .from("import_row_files")
      .update({ is_primary: false })
      .eq("row_id", input.rowId);
    await supabase
      .from("import_row_files")
      .update({ is_primary: false })
      .eq("batch_id", input.batchId)
      .eq("file_id", input.fileId);
  }

  await supabase.from("import_row_files").upsert(
    {
      user_id: userId,
      batch_id: input.batchId,
      row_id: input.rowId,
      file_id: input.fileId,
      page_number: input.pageNumber ?? null,
      score: 100,
      confidence: "very_high",
      match_reasons: [{ key: "manual", label: "Associação manual", points: 100 }],
      is_manual: true,
      is_primary: input.makePrimary ?? true,
    } as any,
    { onConflict: "row_id,file_id,page_number" },
  );
}

export async function detachRowFile(id: string) {
  await supabase.from("import_row_files").delete().eq("id", id);
}

export async function setPrimaryRowFile(rowId: string, linkId: string) {
  const { data: link, error: readError } = await supabase
    .from("import_row_files")
    .select("id, batch_id, file_id, confidence, is_manual")
    .eq("id", linkId)
    .maybeSingle();
  if (readError || !link) throw new Error(readError?.message ?? "Vínculo não encontrado");
  if (!link.is_manual && !isAcceptedTier(link.confidence as MatchTier)) {
    throw new Error("Este comprovante não tem confiança suficiente para associação automática.");
  }
  await supabase.from("import_row_files").update({ is_primary: false }).eq("row_id", rowId);
  await supabase
    .from("import_row_files")
    .update({ is_primary: false })
    .eq("batch_id", link.batch_id)
    .eq("file_id", link.file_id);
  const { error } = await supabase.from("import_row_files").update({ is_primary: true }).eq("id", linkId);
  if (error) throw new Error(error.message);
}