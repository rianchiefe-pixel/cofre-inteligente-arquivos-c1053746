// ---------------------------------------------------------------------------
// Fonte única de verdade da conciliação de um lote de importação.
//
// Regras puras e determinísticas: cada arquivo recebe UM estado exclusivo e
// cada operação da planilha recebe UM estado exclusivo. O painel, a listagem,
// os filtros e o diagnóstico JSON consomem exatamente estes números.
// ---------------------------------------------------------------------------

import { parseOcrMoneyToCents, parseMoneyToCents } from "./format";
import { isCardKind } from "./import-kind";

export type FileState =
  | "linked"
  | "review"
  | "orphan"
  | "duplicate"
  | "unreadable"
  | "unprocessed"
  | "failed"
  | "card_statement"
  | "system";

export type RowState =
  | "matched"
  | "needs_review"
  | "not_found"
  | "card_matched"
  | "card_not_matched";

export const PROCESSED_FILE_STATUSES = new Set(["processed", "ready", "completed", "done"]);
const FAILED_FILE_STATUSES = new Set(["error", "failed"]);
const CONFIRMED_CONFIDENCES = new Set(["high", "very_high", "manual_confirmed"]);

export interface ReconFile {
  id: string;
  file_name: string | null;
  original_path?: string | null;
  status?: string | null;
  readable?: boolean | null;
  duplicate_of?: string | null;
  document_type?: string | null;
  extracted_text?: string | null;
  extracted_text_length?: number | null;
  ocr_data?: any;
  error_message?: string | null;
  storage_path?: string | null;
}

export interface ReconRow {
  id: string;
  row_number?: number | null;
  kind?: string | null;
  amount?: number | string | null;
  transaction_date?: string | null;
  payee?: string | null;
  description?: string | null;
  review_status?: string | null;
  card_last4?: string | null;
}

export interface ReconLink {
  row_id: string;
  file_id: string;
  is_primary?: boolean | null;
  is_manual?: boolean | null;
  confidence?: string | null;
}

export interface ReconCardItem {
  id: string;
  statement_id?: string | null;
  txn_date?: string | null;
  description?: string | null;
  merchant_normalized?: string | null;
  amount?: number | string | null;
  last4?: string | null;
  installment_current?: number | null;
  installment_total?: number | null;
  page_number?: number | null;
  matched_import_row_id?: string | null;
  match_status?: string | null;
}

// ---- helpers --------------------------------------------------------------

export function normalizeMerchant(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ltda|me|eireli|sa|s\/a|comercio|servicos|brasil|br|pagamento|pag|compra)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function merchantOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter((t) => t.length >= 3));
  const tb = new Set(b.split(" ").filter((t) => t.length >= 3));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits += 1;
  return hits / Math.min(ta.size, tb.size);
}

function daysApart(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round(Math.abs(da - db) / 86_400_000);
}

export function isSystemFile(file: ReconFile): boolean {
  const name = String(file.file_name ?? "").trim().toLowerCase();
  const path = String(file.original_path ?? "").trim().toLowerCase();
  if (!name && !path) return true;
  if (path.endsWith("/")) return true;
  if (/^(desktop\.ini|thumbs\.db|\.ds_store|\.gitkeep)$/.test(name)) return true;
  if (name.startsWith("~$") || name.startsWith("._")) return true;
  if (/\.(tmp|temp|part|crdownload)$/.test(name)) return true;
  if (path.includes("__macosx")) return true;
  return false;
}

export function isCardStatementFile(file: ReconFile): boolean {
  if (String(file.document_type ?? "") === "credit_card_statement") return true;
  const hay = `${file.file_name ?? ""} ${file.original_path ?? ""} ${String(file.extracted_text ?? "").slice(0, 4000)}`;
  return /fatura|cart[aã]o\s+de\s+cr[eé]dito|limite\s+de\s+cr[eé]dito|pagamento\s+m[ií]nimo/i.test(hay);
}

export function isDuplicateFile(file: ReconFile): boolean {
  return !!file.duplicate_of || String(file.status ?? "") === "duplicate";
}

export function isUnreadableFile(file: ReconFile): boolean {
  // "Sem valor identificado" NUNCA é ilegível. Somente falha explícita de
  // leitura/OCR registrada pelo processador conta aqui.
  return file.readable === false || String(file.status ?? "") === "unreadable";
}

export function isProcessedFile(file: ReconFile): boolean {
  return PROCESSED_FILE_STATUSES.has(String(file.status ?? ""));
}

export function unprocessedReason(file: ReconFile): string {
  const status = String(file.status ?? "");
  if (!file.storage_path && status !== "processed") return "registro sem arquivo";
  if (FAILED_FILE_STATUSES.has(status)) {
    const msg = String(file.error_message ?? "");
    if (/ocr/i.test(msg)) return "falha de OCR";
    if (/storage|bucket|download/i.test(msg)) return "erro de Storage";
    if (/suport|extens/i.test(msg)) return "formato não suportado";
    return msg ? `erro interno: ${msg}` : "erro interno";
  }
  if (status === "uploaded" || status === "pending" || status === "queued" || status === "processing")
    return "processamento pendente";
  if (!status) return "não carregado";
  return `não processado (${status})`;
}

export function isConfirmedLink(link: ReconLink): boolean {
  if (!link.is_primary) return false;
  if (String(link.confidence ?? "") === "rejected") return false;
  return !!link.is_manual || CONFIRMED_CONFIDENCES.has(String(link.confidence ?? ""));
}

export function isReviewLink(link: ReconLink): boolean {
  return !link.is_primary && String(link.confidence ?? "") === "review";
}

// ---- classificação exclusiva ---------------------------------------------

export interface FileClassificationContext {
  linkedFileIds: Set<string>;
  reviewFileIds: Set<string>;
  cardStatementFileIds: Set<string>;
}

export function classifyFile(
  file: ReconFile,
  ctx: FileClassificationContext,
): { state: FileState; reason: string } {
  if (isSystemFile(file)) return { state: "system", reason: "arquivo de sistema/pasta" };
  if (isDuplicateFile(file)) return { state: "duplicate", reason: "duplicidade confirmada" };
  if (isUnreadableFile(file)) return { state: "unreadable", reason: "leitura/OCR falhou" };
  if (ctx.linkedFileIds.has(file.id)) return { state: "linked", reason: "vínculo persistido" };
  if (ctx.reviewFileIds.has(file.id)) return { state: "review", reason: "candidato em revisão" };
  if (ctx.cardStatementFileIds.has(file.id) || isCardStatementFile(file))
    return { state: "card_statement", reason: "fatura de cartão de crédito" };
  if (FAILED_FILE_STATUSES.has(String(file.status ?? "")))
    return { state: "failed", reason: unprocessedReason(file) };
  if (!isProcessedFile(file)) return { state: "unprocessed", reason: unprocessedReason(file) };
  return { state: "orphan", reason: "processado, legível e sem vínculo" };
}

export function classifyRow(
  row: ReconRow,
  links: ReconLink[],
  cardMatchedRowIds: Set<string>,
): RowState {
  if (isCardKind(row.kind ?? undefined)) {
    return cardMatchedRowIds.has(row.id) ? "card_matched" : "card_not_matched";
  }
  if (links.some(isConfirmedLink)) return "matched";
  if (links.some(isReviewLink)) return "needs_review";
  return "not_found";
}

// ---- conciliação de operações de cartão com itens de fatura --------------

export type CardMatchStatus = "matched" | "possible" | "ambiguous" | "unmatched";

export interface CardMatchDecision {
  rowId: string;
  itemId: string | null;
  status: CardMatchStatus;
  score: number;
  reason: string;
}

export function matchCardRowToItems(row: ReconRow, items: ReconCardItem[]): CardMatchDecision {
  const rowCents = parseMoneyToCents(row.amount);
  if (rowCents === null || rowCents === 0)
    return { rowId: row.id, itemId: null, status: "unmatched", score: 0, reason: "operação sem valor" };

  const rowMerchant = normalizeMerchant(row.payee ?? row.description ?? "");
  const rowLast4 = String(row.card_last4 ?? "").replace(/\D/g, "").slice(-4);

  const scored = items
    .map((item) => {
      const itemCents = parseMoneyToCents(item.amount);
      if (itemCents === null) return null;
      if (Math.abs(itemCents) !== Math.abs(rowCents)) return null;

      let score = 50;
      const diff = daysApart(row.transaction_date, item.txn_date);
      if (diff === 0) score += 25;
      else if (diff !== null && diff <= 3) score += 15;
      else if (diff !== null && diff <= 7) score += 5;
      else if (diff !== null) return null;

      const itemMerchant = item.merchant_normalized || normalizeMerchant(item.description);
      const overlap = merchantOverlap(rowMerchant, itemMerchant);
      if (overlap >= 0.6) score += 20;
      else if (overlap >= 0.3) score += 8;

      const itemLast4 = String(item.last4 ?? "").replace(/\D/g, "").slice(-4);
      if (rowLast4 && itemLast4 && rowLast4 === itemLast4) score += 10;
      else if (rowLast4 && itemLast4) score -= 15;

      return { item, score, diff, overlap };
    })
    .filter((x): x is { item: ReconCardItem; score: number; diff: number | null; overlap: number } => !!x)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0)
    return { rowId: row.id, itemId: null, status: "unmatched", score: 0, reason: "nenhum item de fatura com o mesmo valor" };

  const top = scored[0];
  const tie = scored.length > 1 && scored[1].score === top.score;

  if (tie)
    return {
      rowId: row.id,
      itemId: null,
      status: "ambiguous",
      score: top.score,
      reason: "mesmo valor em vários lançamentos da fatura — revisão manual",
    };

  if (top.diff !== null && top.diff <= 3 && top.overlap >= 0.6)
    return { rowId: row.id, itemId: top.item.id, status: "matched", score: top.score, reason: "valor + data + estabelecimento" };

  if (top.diff !== null && top.diff <= 7)
    return { rowId: row.id, itemId: top.item.id, status: "possible", score: top.score, reason: "valor + data, estabelecimento duvidoso" };

  return { rowId: row.id, itemId: null, status: "unmatched", score: top.score, reason: "sem data compatível" };
}

// ---- resumo ---------------------------------------------------------------

export interface FileReport {
  file_id: string;
  file_name: string;
  batch_id: string;
  processing_status: string;
  state: FileState;
  state_reason: string;
  included_in_matching: boolean;
  exclusion_reason: string;
  readable: boolean;
  is_duplicate: boolean;
  duplicate_of: string | null;
  document_type: string;
  extracted_text_length: number;
  extracted_amount_raw: string | number | null;
  extracted_amount_cents: number | null;
  extracted_date: string | null;
  extracted_payee: string | null;
  linked_row_ids: string[];
  candidate_row_ids: string[];
}

export interface ReconciliationSummary {
  batch_id: string;
  generated_at: string;
  rows: {
    total: number;
    matched: number;
    needs_review: number;
    not_found: number;
    card_total: number;
    card_matched: number;
    card_not_matched: number;
  };
  files: {
    received: number;
    processed: number;
    unprocessed: number;
    linked: number;
    review: number;
    orphan: number;
    duplicate: number;
    unreadable: number;
    failed: number;
    card_statement: number;
    system: number;
  };
  cards: {
    statements: number;
    statement_items: number;
    rows_linked_to_items: number;
  };
  unprocessed_reasons: Record<string, number>;
  consistency: { files_balanced: boolean; rows_balanced: boolean };
  file_reports: FileReport[];
}

export function summarizeReconciliation(input: {
  batchId: string;
  rows: ReconRow[];
  files: ReconFile[];
  links: ReconLink[];
  cardItems: ReconCardItem[];
  statementCount?: number;
  statementFileIds?: string[];
}): ReconciliationSummary {
  const { batchId, rows, files, links, cardItems } = input;

  const existingFileIds = new Set(files.map((f) => f.id));

  // Vínculo cujo arquivo não existe mais no lote não vale como comprovante.
  const linksByRow = new Map<string, ReconLink[]>();
  for (const l of links) {
    if (!existingFileIds.has(l.file_id)) continue;
    if (!linksByRow.has(l.row_id)) linksByRow.set(l.row_id, []);
    linksByRow.get(l.row_id)!.push(l);
  }

  const linkedFileIds = new Set<string>();
  const reviewFileIds = new Set<string>();
  const linkedRowsByFile = new Map<string, string[]>();
  const candidateRowsByFile = new Map<string, string[]>();

  for (const l of links) {
    if (!existingFileIds.has(l.file_id)) continue; // arquivo excluído não vincula
    if (isConfirmedLink(l)) {
      linkedFileIds.add(l.file_id);
      if (!linkedRowsByFile.has(l.file_id)) linkedRowsByFile.set(l.file_id, []);
      linkedRowsByFile.get(l.file_id)!.push(l.row_id);
    } else if (isReviewLink(l)) {
      reviewFileIds.add(l.file_id);
      if (!candidateRowsByFile.has(l.file_id)) candidateRowsByFile.set(l.file_id, []);
      candidateRowsByFile.get(l.file_id)!.push(l.row_id);
    }
  }
  // Um arquivo já vinculado nunca é contado como candidato em revisão.
  for (const id of linkedFileIds) reviewFileIds.delete(id);

  const cardStatementFileIds = new Set(input.statementFileIds ?? []);

  const cardMatchedRowIds = new Set(
    cardItems
      .filter(
        (i) =>
          !!i.matched_import_row_id &&
          ["matched", "manual", "manual_confirmed"].includes(String(i.match_status ?? "matched")),
      )
      .map((i) => i.matched_import_row_id as string),
  );

  const rowCounters = {
    total: rows.length,
    matched: 0,
    needs_review: 0,
    not_found: 0,
    card_total: 0,
    card_matched: 0,
    card_not_matched: 0,
  };

  for (const row of rows) {
    const state = classifyRow(row, linksByRow.get(row.id) ?? [], cardMatchedRowIds);
    if (state === "card_matched") {
      rowCounters.card_total += 1;
      rowCounters.card_matched += 1;
    } else if (state === "card_not_matched") {
      rowCounters.card_total += 1;
      rowCounters.card_not_matched += 1;
    } else if (state === "matched") rowCounters.matched += 1;
    else if (state === "needs_review") rowCounters.needs_review += 1;
    else rowCounters.not_found += 1;
  }

  const fileCounters = {
    received: files.length,
    processed: 0,
    unprocessed: 0,
    linked: 0,
    review: 0,
    orphan: 0,
    duplicate: 0,
    unreadable: 0,
    failed: 0,
    card_statement: 0,
    system: 0,
  };
  const unprocessedReasons: Record<string, number> = {};
  const fileReports: FileReport[] = [];
  const ctx: FileClassificationContext = { linkedFileIds, reviewFileIds, cardStatementFileIds };

  for (const file of files) {
    const { state, reason } = classifyFile(file, ctx);
    fileCounters[state] += 1;
    if (isProcessedFile(file)) fileCounters.processed += 1;
    if (state === "unprocessed" || state === "failed") {
      unprocessedReasons[reason] = (unprocessedReasons[reason] ?? 0) + 1;
    }

    const ocr = (file.ocr_data ?? {}) as any;
    const amountRaw = ocr.amount_raw ?? ocr.amount ?? null;
    const textLength =
      file.extracted_text_length ?? String(file.extracted_text ?? "").length;
    const included = state !== "unprocessed" && state !== "failed" && state !== "system" && state !== "unreadable";

    fileReports.push({
      file_id: file.id,
      file_name: String(file.file_name ?? ""),
      batch_id: batchId,
      processing_status: String(file.status ?? ""),
      state,
      state_reason: reason,
      included_in_matching: included,
      exclusion_reason: included ? "" : reason,
      readable: file.readable !== false,
      is_duplicate: isDuplicateFile(file),
      duplicate_of: file.duplicate_of ?? null,
      document_type:
        String(file.document_type ?? "") && String(file.document_type) !== "unknown"
          ? String(file.document_type)
          : state === "card_statement"
            ? "credit_card_statement"
            : "receipt",
      extracted_text_length: textLength,
      extracted_amount_raw:
        typeof amountRaw === "string" || typeof amountRaw === "number" ? amountRaw : null,
      extracted_amount_cents: parseOcrMoneyToCents(amountRaw),
      extracted_date: ocr.date ? String(ocr.date) : null,
      extracted_payee: ocr.payee ? String(ocr.payee) : null,
      linked_row_ids: linkedRowsByFile.get(file.id) ?? [],
      candidate_row_ids: candidateRowsByFile.get(file.id) ?? [],
    });
  }

  const filesByState =
    fileCounters.linked +
    fileCounters.review +
    fileCounters.orphan +
    fileCounters.duplicate +
    fileCounters.unreadable +
    fileCounters.unprocessed +
    fileCounters.failed +
    fileCounters.card_statement +
    fileCounters.system;

  const rowsByState =
    rowCounters.matched +
    rowCounters.needs_review +
    rowCounters.not_found +
    rowCounters.card_matched +
    rowCounters.card_not_matched;

  return {
    batch_id: batchId,
    generated_at: new Date().toISOString(),
    rows: rowCounters,
    files: fileCounters,
    cards: {
      statements: input.statementCount ?? 0,
      statement_items: cardItems.length,
      rows_linked_to_items: rowCounters.card_matched,
    },
    unprocessed_reasons: unprocessedReasons,
    consistency: {
      files_balanced: filesByState === fileCounters.received,
      rows_balanced: rowsByState === rowCounters.total,
    },
    file_reports: fileReports,
  };
}