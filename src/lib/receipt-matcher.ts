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

export type MatchTier = "very_high" | "high" | "review" | "low" | "none";

export interface CandidateReason {
  key: string;
  label: string;
  points: number;
}

export interface Candidate {
  fileId: string;
  pageNumber: number | null;
  score: number;
  confidence: MatchTier;
  reasons: CandidateReason[];
  matched: string[];
  divergent: string[];
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
  row: any,
  candidatesCount: number
): MatchTier {
  if (divergent.length > 0) return "none";

  // REGRA DE OURO: Bloqueio de ambiguidade por valor.
  // Se existirem múltiplos candidatos com o mesmo valor, só permitimos associação
  // automática se houver um critério desempate forte (Data + Favorecido ou ID único).
  const hasStrongTiebreaker = (matched.has("date") && matched.has("payee")) || 
                             matched.has("id") || matched.has("txid") || matched.has("auth");

  if (candidatesCount > 1 && !hasStrongTiebreaker) {
    divergent.push("Ambiguidade entre linhas — revisão manual necessária (múltiplos candidatos com mesmo valor)");
    return "none";
  }

  const hasId = matched.has("id") || matched.has("txid") || matched.has("auth");
  const coreOk = matched.has("amount") && matched.has("date") && matched.has("payee");
  
  if (hasId && matched.has("amount")) return "very_high";
  if (coreOk && matched.has("amount")) return "high";
  if (matched.has("amount") && matched.has("date") && (matched.has("bank") || matched.has("doc"))) {
    return "review";
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
  };
}

function scoreRowAgainstFile(row: any, f: FileFacts): Candidate | null {
  const reasons: CandidateReason[] = [];
  const matched = new Set<string>();
  const divergent: string[] = [];
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
  }
  if (wantedFolder) {
    const wf = norm(wantedFolder);
    if (wf && f.pathNorm.includes(wf)) {
      score += 6;
      reasons.push({ key: "folder", label: `pasta/mês: ${wantedFolder}`, points: 6 });
    }
  }

  // 2. Source / transaction id (35)
  const ids = [rowSourceId, rowInvoice].filter(Boolean);
  for (const id of ids) {
    const d = digits(id);
    const n = norm(id);
    if ((d && d.length >= 4 && (f.nameNorm === d || f.pathNorm === d || f.textNorm === d)) ||
        (n && n.length >= 4 && (f.nameNorm === n || f.textNorm === n))) {
      score += 35;
      reasons.push({ key: "id", label: `ID/transação: ${id}`, points: 35 });
      matched.add("id");
      break;
    }
  }

  // 3. Amount (25) — exatidão absoluta exigida (comportamento de auditor).
  // Nunca permitir associação se os valores forem diferentes (R$ 0,00 permitida).
  const hasExplicit = matched.has("path") || matched.has("id");
  const rowCents = toCents(row.amount);
  if (rowCents !== null && rowCents !== 0) {
    const ocrCents = toCents(ocr.amount_raw ?? ocr.amount);
    
    // Se o OCR identificou um valor, ele DEVE ser idêntico.
    if (ocrCents !== null) {
      if (rowCents === ocrCents) {
        score += 25;
        reasons.push({ key: "amount", label: `valor exato R$ ${formatBrlNumber(row.amount as number)}`, points: 25 });
        matched.add("amount");
      } else {
        divergent.push(`valor diverge: planilha R$ ${formatBrlNumber(row.amount as number)} × comprovante R$ ${formatBrlNumber((ocr.amount_raw ?? ocr.amount) as number)}`);
        return null;
      }
    } else {
      // Fallback: Busca exaustiva por valores monetários no texto bruto via regex.
      // Deve respeitar fronteiras de palavra para evitar correspondência parcial.
      const rawText = `${f.file_name} ${f.extracted_text}`;
      const moneyRegex = /(?:R\$?\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;
      let match;
      let foundExact = false;
      let foundOther = false;

      while ((match = moneyRegex.exec(rawText)) !== null) {
        const foundCents = toCents(match[1]);
        if (foundCents === rowCents) {
          foundExact = true;
        } else if (foundCents !== null) {
          foundOther = true;
        }
      }

      if (foundExact && !foundOther) {
        score += 25;
        reasons.push({ key: "amount", label: `valor encontrado R$ ${formatBrlNumber(row.amount as number)}`, points: 25 });
        matched.add("amount");
      } else if (foundExact && foundOther) {
        divergent.push("Valor ambíguo — múltiplos valores financeiros no comprovante");
        return null;
      } else {
        divergent.push(`valor não encontrado no texto: R$ ${formatBrlNumber(row.amount as number)}`);
        return null;
      }
    }
  } else {
    // Linha sem valor não pode ser associada automaticamente por este motor.
    return null;
  }

  if (!matched.has("amount")) return null;

  // 4. Date (20) — validação rigorosa contra OCR. Somente datas compatíveis são aceitas.
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
    }
  } else if (!hasExplicit && !matched.has("amount")) {
    return null;
  }

  // A data é um critério de auditoria. Se a data for divergente e não for ID explícito, desconsiderar.
  if (!hasExplicit && !matched.has("date")) return null;

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
    } else if (ocr.payee) {
      divergent.push(`favorecido diverge (planilha "${payee}" × comprovante "${ocr.payee}")`);
    }
  } else if (!hasExplicit) {
    return null;
  }

  // Favorecido é desejável para aumentar confiança.
  if (!hasExplicit && !matched.has("payee")) return null;

  // 6. Bank (8) + card (8) — normalize aliases (ITAÚ UNIBANCO S.A. ≡ Itaú).
  const bank = String(row.bank ?? "").trim();
  if (bank) {
    const rowBankKey = normalizeBank(bank);
    const fileBankKeys = new Set<string>([
      ...(ocr.banks ?? []),
      ...(ocr.bank_from ? [ocr.bank_from] : []),
      ...(ocr.bank_to ? [ocr.bank_to] : []),
    ]);
    const textHit = (() => {
      const bn = norm(bank);
      return !!bn && (f.textNorm.includes(bn) || f.nameNorm.includes(bn) || f.pathNorm.includes(bn));
    })();
    if ((rowBankKey && fileBankKeys.has(rowBankKey)) || textHit) {
      score += 8;
      reasons.push({ key: "bank", label: `mesmo banco: ${bank}`, points: 8 });
      matched.add("bank");
    } else if (rowBankKey && fileBankKeys.size > 0 && !fileBankKeys.has(rowBankKey)) {
      divergent.push(`banco diverge (planilha "${bank}" × comprovante "${[...fileBankKeys].join(", ")}")`);
    }
  }
  const cardTail = String(row.card_last4 ?? "").replace(/\D/g, "");
  if (cardTail.length === 4) {
    const hay = `${f.file_name} ${f.extracted_text}`;
    if (hay.includes(cardTail)) {
      score += 8;
      reasons.push({ key: "card", label: `final do cartão ${cardTail}`, points: 8 });
      matched.add("card");
    }
  }

  // 7. Holder (8)
  const holder = String(row.holder ?? "").trim();
  if (holder) {
    const ov = Math.max(
      tokenOverlap(tokens(holder), tokens(ocr.payer ?? "")),
      tokenOverlap(tokens(holder), f.tokens),
    );
    if (ov >= 0.5) {
      score += 8;
      reasons.push({ key: "holder", label: `mesmo titular: ${holder}`, points: 8 });
      matched.add("holder");
    }
  }

  // 8. Payment method (5)
  const pm = String(row.payment_method ?? "").trim();
  if (pm) {
    const pn = norm(pm);
    const pmSame = ocr.payment_method && norm(ocr.payment_method).includes(pn.split(" ")[0]);
    if (pmSame || (pn && (f.textNorm.includes(pn) || f.nameNorm.includes(pn)))) {
      score += 5;
      reasons.push({ key: "pm", label: `forma de pagamento ${pm}`, points: 5 });
      matched.add("payment_method");
    }
  }

  // 9. Auth / transaction id / CPF-CNPJ from OCR against row
  const rowAuth = String(row.auth_code ?? "").trim();
  if (rowAuth && ocr.auth_code && norm(rowAuth) === norm(ocr.auth_code)) {
    score += 10;
    reasons.push({ key: "auth", label: `autenticação ${ocr.auth_code}`, points: 10 });
    matched.add("auth");
  }
  const rowTx = String(row.source_id ?? row.invoice_number ?? "").trim();
  if (rowTx && ocr.transaction_id && digits(rowTx) && digits(ocr.transaction_id).includes(digits(rowTx))) {
    score += 10;
    reasons.push({ key: "txid", label: `ID transação ${ocr.transaction_id}`, points: 10 });
    matched.add("txid");
  }
  const rowDoc = digits(row.tax_id ?? row.cpf ?? row.cnpj ?? "");
  if (rowDoc.length >= 11) {
    const docs = [...(ocr.cpf ?? []), ...(ocr.cnpj ?? [])].map(digits);
    if (docs.some((d) => d === rowDoc)) {
      score += 10;
      reasons.push({ key: "doc", label: `CPF/CNPJ ${rowDoc}`, points: 10 });
      matched.add("doc");
    }
  }

  if (score <= 0) return null;
  if (score > 100) score = 100;

  // REGRA DE OURO: Se o valor não bateu exatamente, nunca vincular automaticamente.
  if (!matched.has("amount")) return null;

  // Calculamos a confiança inicial. Se houver ambiguidade de arquivos, o matchBatchReceipts lidará com isso.
  const confidence = gatedTier(score, matched, divergent, row, 1);
  if (confidence === "none") return null;

  // Prefer page from row hint, else file name hint
  const pageHint = extractPageHint(row.page_number) ?? f.pageHint ?? null;

  return {
    fileId: f.id,
    pageNumber: pageHint,
    score,
    confidence,
    reasons: [
      ...reasons,
      ...divergent.map((label) => ({ key: "divergence", label, points: 0 })),
    ],
    matched: [...matched],
    divergent,
  };
}

// ---- Public API ----------------------------------------------------------

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
  };

  const bestByRow = new Map<string, Candidate>();
  const fileClaims = new Map<string, string[]>();

  for (const row of rowList) {
    if (manualRows.has(row.id)) continue;
    // Regra 3 — transações de cartão de crédito ficam FORA do cruzamento
    // comum. Só recebem vínculo se o comprovante for explicitamente de
    // cartão (marcadores "fatura", "cartão de crédito", "final XXXX").
    if (isCardKind(row.kind)) continue;
    const scored: Candidate[] = [];
    
    // Passo 1: Filtrar arquivos candidatos por valor (Obrigatório)
    const candidatesForValue = fileFacts.map(f => scoreRowAgainstFile(row, f)).filter(c => c !== null) as Candidate[];
    const valueMatchCount = candidatesForValue.length;

    for (const c of candidatesForValue) {
      // Recalcular tier com o count real de candidatos para o mesmo valor
      c.confidence = gatedTier(c.score, new Set(c.matched), c.divergent, row, valueMatchCount);

      if (isAcceptedTier(c.confidence) && !reservedFiles.has(c.fileId)) {
        scored.push(c);
      }
    }
    scored.sort((a, b) => b.score - a.score);
    
    // Filtro final de segurança: Se houver mais de uma opção com a mesma pontuação máxima,
    // não vincular nenhuma automaticamente (conflito de ambiguos).
    const top = scored[0];
    if (top) {
      const ties = scored.filter(s => s.score === top.score).length;
      if (ties > 1) {
        // Ambiguidade detectada: duas ou mais opções são igualmente boas.
        // O sistema deve privilegiar a segurança e não associar nenhuma.
        continue;
      }
      bestByRow.set(row.id, top);
      if (!fileClaims.has(top.fileId)) fileClaims.set(top.fileId, []);
      fileClaims.get(top.fileId)!.push(row.id);
    }
  }

  // Cartão de crédito: tenta vincular apenas contra comprovantes que
  // explicitamente identificam cartão. Regra restrita — sem match → bucket.
  const cardFileFacts = fileFacts.filter((f) => {
    const hay = `${f.file_name} ${f.textNorm}`;
    return /fatura|cartao de credito|cart[aã]o de cr[eé]dito|final \d{4}/i.test(hay);
  });
  for (const row of rowList) {
    if (!isCardKind(row.kind)) continue;
    progress.cardRows += 1;
    if (manualRows.has(row.id)) { progress.cardMatched += 1; continue; }
    const scored: Candidate[] = [];
    const candidatesForValue = cardFileFacts.map(f => scoreRowAgainstFile(row, f)).filter(c => c !== null) as Candidate[];
    const valueMatchCount = candidatesForValue.length;

    for (const c of candidatesForValue) {
      c.confidence = gatedTier(c.score, new Set(c.matched), c.divergent, row, valueMatchCount);
      if (isAcceptedTier(c.confidence) && !reservedFiles.has(c.fileId)) {
        scored.push(c);
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (top) {
      bestByRow.set(row.id, top);
      if (!fileClaims.has(top.fileId)) fileClaims.set(top.fileId, []);
      fileClaims.get(top.fileId)!.push(row.id);
    }
  }

  const payload: any[] = [];

  for (const row of rowList) {
    if (manualRows.has(row.id)) {
      progress.matched++;
      progress.rowsDone++;
      if (opts.onProgress && progress.rowsDone % 5 === 0) opts.onProgress({ ...progress });
      continue;
    }
    if (isCardKind(row.kind)) {
      const topCard = bestByRow.get(row.id);
      if (topCard) {
        progress.cardMatched += 1;
        payload.push({
          user_id: userId,
          batch_id: batchId,
          row_id: row.id,
          file_id: topCard.fileId,
          page_number: topCard.pageNumber,
          score: topCard.score,
          confidence: topCard.confidence,
          match_reasons: topCard.reasons,
          is_manual: false,
          is_primary: true,
        });
      }
      progress.rowsDone++;
      continue;
    }

    const top = bestByRow.get(row.id);
    const claims = top ? (fileClaims.get(top.fileId) ?? []) : [];

    if (!top) {
      progress.notFound++;
    } else if (claims.length > 1) {
      // Regra Conservadora: se existir mais de uma possibilidade compatível, 
      // cancela a associação automática para evitar suposições.
      progress.needsReview++;
    } else {
      progress.matched++;
      payload.push({
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
    }

    progress.rowsDone++;
    if (opts.onProgress && progress.rowsDone % 5 === 0) opts.onProgress({ ...progress });
  }

  // ---------------------------------------------------------------------------
  // Persistência Transacional (Simulada via Lógica + Upsert)
  // ---------------------------------------------------------------------------
  
  // 1. Validar resultados finais contra ambiguidade global de comprovantes
  const finalPayload: any[] = [];
  const finalFileClaims = new Map<string, number>();
  
  for (const p of payload) {
    const count = finalFileClaims.get(p.file_id) ?? 0;
    finalFileClaims.set(p.file_id, count + 1);
  }

  for (const p of payload) {
    // Verificação de ambiguidade bidirecional (um comprovante -> mais de uma linha)
    if (finalFileClaims.get(p.file_id)! > 1) {
      progress.needsReview++;
      progress.matched--;
      continue;
    }

    // 2. Barreira obrigatória na gravação: Validar valores financeiros
    const row = rowList.find(r => r.id === p.row_id);
    const file = rawFiles.find(f => f.id === p.file_id);
    
    if (row && file) {
      try {
        const ocr = (file.ocr_data ?? {}) as any;
        const receiptAmount = ocr.amount_raw ?? ocr.amount;
        assertMatchingAmounts(row.amount, receiptAmount);
        finalPayload.push(p);
      } catch (e) {
        console.warn(`Vínculo automático rejeitado por divergência financeira: ${row.id} - ${file.id}`);
        progress.matched--;
        progress.needsReview++;
      }
    }
  }

  // 3. Execução "Transacional": Limpar antigos e inserir novos em um único passo lógico
  // Nota: O Supabase JS não suporta transações reais multi-request facilmente sem Edge Functions,
  // então usamos a lógica de exclusão sequencial seguida de inserção.
  
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
    if (error) {
      console.error("Erro na persistência do lote:", error);
      throw new Error(`Falha no reprocessamento transacional: ${error.message}`);
    }
  }

  // Arquivos sem vínculo (nem automático nem manual).
  const claimedFileIds = new Set<string>([
    ...payload.map((p) => p.file_id),
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