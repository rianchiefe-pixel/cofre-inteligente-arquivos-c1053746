import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Parte 1 — Leitura Inteligente da Planilha
//
// This module handles the low-level parsing:
//   * accepts CSV / XLS / XLSX
//   * auto-detects the header row (even when there are titles/blank lines above)
//   * detects the CSV separator ( ;  ,  \t  | )
//   * detects the encoding (via XLSX, which tries UTF-8 then latin1)
//   * parses BR dates (dd/mm/yyyy, dd-mm-yyyy, Excel serial numbers)
//   * parses BRL money strings ("1.234,56", "R$ 1.234,56", "(123,45)")
//   * maps out-of-order columns to canonical fields (Id, Valor, Moeda, ...)
//   * splits the "Notas" column into structured sub-fields
// ---------------------------------------------------------------------------

export type CanonicalField =
  | "id"
  | "amount"
  | "currency"
  | "category"
  | "account"
  | "date"
  | "counterparty"
  | "notes"
  | "amount_brl";

export type ColumnMapping = Partial<Record<CanonicalField, number>>;

export interface HeaderDetection {
  headerRow: number; // 0-based index in the raw matrix
  header: string[];
  mapping: ColumnMapping;
  confidence: number;
}

export interface ParsedFile {
  matrix: unknown[][]; // full sheet as rows of cells (raw)
  separator?: string; // only for CSV
  sheetName: string;
}

export interface NormalizedRow {
  row_number: number;
  raw: Record<string, unknown>;
  normalized: {
    id?: string;
    amount?: number;
    currency?: string;
    category?: string;
    account?: string;
    date?: string; // YYYY-MM-DD
    counterparty?: string;
    description?: string;
    notes?: string;
    amount_brl?: number;
  };
  parsed_notes: ParsedNotes;
  status: "ok" | "warning" | "error";
  error?: string;
}

export interface ParsedNotes {
  payment_method?: string;
  bank?: string;
  card?: string;
  holder?: string;
  original_date?: string;
  file_name?: string;
  folder_path?: string;
  source_id?: string;
  original_category?: string;
  source_sheet?: string;
  invoice_number?: string;
  page_number?: string;
  extras: string[];
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

const CSV_SEPARATORS = [";", ",", "\t", "|"] as const;

function countSeparatorOutsideQuotes(line: string, separator: string): number {
  let count = 0;
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Handle escaped double quotes ("")
      if (insideQuotes && line[i + 1] === '"') {
        i++;
        continue;
      }
      insideQuotes = !insideQuotes;
      continue;
    }

    if (!insideQuotes && char === separator) {
      count++;
    }
  }

  return count;
}

function detectSeparator(sample: string): string {
  const lines = sample.split(/\r?\n/).slice(0, 50).filter((l) => l.trim().length > 0);
  
  const results = CSV_SEPARATORS.map((sep) => {
    const counts = lines.map((l) => countSeparatorOutsideQuotes(l, sep));
    if (counts.length === 0) return { sep, score: -1 };

    // Mode: find the most frequent count (excluding zero)
    const frequency: Record<number, number> = {};
    counts.forEach((c) => {
      if (c > 0) frequency[c] = (frequency[c] || 0) + 1;
    });

    const entries = Object.entries(frequency);
    if (entries.length === 0) return { sep, score: -1 };

    // The most frequent number of separators
    const mode = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const modeCount = Number(mode[0]);
    const modeFrequency = mode[1];

    // Score: prefer separators that appear consistently in many rows
    // Bonus for higher number of columns
    const consistency = modeFrequency / counts.length;
    const score = modeCount * consistency;

    return { sep, score };
  });

  const best = results.reduce((a, b) => (b.score > a.score ? b : a));
  return best.score > 0 ? best.sep : ";";
}

function decodeCsvBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // BOM detection
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  // Try UTF-8 strict; fall back to latin1 on failure or on replacement chars.
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return utf8;
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function readSpreadsheet(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = decodeCsvBytes(buffer);
    const separator = detectSeparator(text);
    const wb = XLSX.read(text, { type: "string", FS: separator, raw: true });
    const sheetName = wb.SheetNames[0];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false,
    });
    return { matrix, separator, sheetName };
  }

  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });
  return { matrix, sheetName };
}

// ---------------------------------------------------------------------------
// Header detection & column mapping
// ---------------------------------------------------------------------------

const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  id: ["id", "codigo", "código", "identificador", "ref", "referencia"],
  amount: ["valor", "montante", "quantia", "amount", "vlr"],
  currency: ["moeda", "currency", "ccy"],
  category: ["categoria", "category", "classificacao", "classificação"],
  account: ["conta", "account", "carteira"],
  date: ["data", "date", "dt", "vencimento", "competencia", "competência"],
  counterparty: [
    "de/para",
    "de para",
    "para/de",
    "descricao",
    "descrição",
    "beneficiario",
    "beneficiário",
    "favorecido",
    "pagador",
    "cliente",
    "fornecedor",
    "contraparte",
    "counterparty",
  ],
  notes: [
    "notas",
    "nota",
    "observacao",
    "observação",
    "obs",
    "observacoes",
    "observações",
    "comentario",
    "comentário",
    "notes",
  ],
  amount_brl: ["valor (brl)", "valor brl", "valor em brl", "valor r$"],
};

function normalizeName(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchField(cell: string): CanonicalField | null {
  const norm = normalizeName(cell);
  if (!norm) return null;
  // exact-first pass
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
    CanonicalField,
    string[],
  ][]) {
    if (aliases.some((a) => a === norm)) return field;
  }
  // contains pass
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
    CanonicalField,
    string[],
  ][]) {
    if (aliases.some((a) => norm.includes(a) || a.includes(norm))) return field;
  }
  return null;
}

function scoreHeaderRow(row: unknown[]): {
  mapping: ColumnMapping;
  score: number;
  header: string[];
} {
  const mapping: ColumnMapping = {};
  const header: string[] = [];
  let score = 0;
  row.forEach((cell, idx) => {
    const label = String(cell ?? "").trim();
    header.push(label);
    const field = matchField(label);
    if (field && mapping[field] === undefined) {
      mapping[field] = idx;
      score += 1;
    }
  });
  // Amount is the single most important field; boost when present.
  if (mapping.amount !== undefined) score += 2;
  if (mapping.date !== undefined) score += 1;
  return { mapping, score, header };
}

export function detectHeader(matrix: unknown[][]): HeaderDetection {
  const scan = Math.min(matrix.length, 25);
  let best: HeaderDetection = {
    headerRow: 0,
    header: matrix[0]?.map((c) => String(c ?? "")) ?? [],
    mapping: {},
    confidence: 0,
  };
  for (let i = 0; i < scan; i++) {
    const { mapping, score, header } = scoreHeaderRow(matrix[i] ?? []);
    const filledCells = header.filter((h) => h.trim().length > 0).length;
    // Prefer rows with more non-empty cells as tiebreaker.
    const total = score + filledCells * 0.1;
    if (total > best.confidence) {
      best = {
        headerRow: i,
        header,
        mapping,
        confidence: total,
      };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

import { parseMoneyToCents } from "@/lib/format";

export function parseBRLNumber(raw: unknown): number | null {
  const cents = parseMoneyToCents(raw);
  return cents !== null ? cents / 100 : null;
}

export function parseBRDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  
  // If it's already a Date object, extract local parts to avoid UTC shift
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Handle Excel numeric dates
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel serial date (1900 system)
    // 25569 is the Unix epoch (1970-01-01) in Excel terms
    // We add a tiny buffer to handle floating point precision
    const utcMs = Math.round((raw - 25569) * 86400 * 1000);
    const date = new Date(utcMs);
    if (!Number.isNaN(date.getTime())) {
      // Excel dates are UTC-aligned relative to 1900-01-01
      // However, 1900 was NOT a leap year but Excel treats it as one for compatibility
      // For dates after 1900-02-28, the offset is correct.
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  const s = String(raw).trim();
  if (!s) return null;

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const brMatch = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (brMatch) {
    let [_, dd, mm, yy] = brMatch;
    let year = Number(yy);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return `${String(year).padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // ISO yyyy-mm-dd
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  return null;
}

// ---------------------------------------------------------------------------
// Notes parsing — splits a "Notas" cell into structured fields
// ---------------------------------------------------------------------------

const NOTE_KEY_MAP: Array<{ keys: string[]; field: keyof ParsedNotes }> = [
  { keys: ["forma de pagamento", "pagamento", "pgto", "método", "metodo"], field: "payment_method" },
  { keys: ["banco", "instituicao", "instituição"], field: "bank" },
  { keys: ["cartao", "cartão", "card"], field: "card" },
  { keys: ["titular", "pagador", "portador"], field: "holder" },
  { keys: ["data original", "data orig", "data doc", "data do documento"], field: "original_date" },
  { keys: ["arquivo", "file", "nome do arquivo"], field: "file_name" },
  { keys: ["pasta", "diretorio", "diretório", "folder", "caminho"], field: "folder_path" },
  { keys: ["id", "id origem", "id de origem", "identificador"], field: "source_id" },
  { keys: ["categoria original", "cat original", "categoria orig"], field: "original_category" },
  { keys: ["aba", "planilha origem", "aba origem", "sheet"], field: "source_sheet" },
  { keys: ["fatura", "nota fiscal", "nf", "invoice"], field: "invoice_number" },
  { keys: ["pagina", "página", "page"], field: "page_number" },
];

const PAYMENT_METHODS = [
  "pix", "boleto", "ted", "doc", "debito", "débito", "credito", "crédito",
  "dinheiro", "transferencia", "transferência", "cartao", "cartão",
];

const BANK_HINTS = [
  "itau", "itaú", "bradesco", "santander", "banco do brasil", "bb", "caixa",
  "nubank", "inter", "c6", "sicoob", "sicredi", "safra", "btg", "xp", "next",
  "pagseguro", "picpay", "mercado pago", "will",
];

export function parseNotes(raw: unknown): ParsedNotes {
  const out: ParsedNotes = { extras: [] };
  const s = String(raw ?? "").trim();
  if (!s) return out;

  const fragments = s.split(/[;\n]+/).map((f) => f.trim()).filter(Boolean);
  for (const frag of fragments) {
    // key: value
    const kv = frag.match(/^([^:=]+)[:=](.+)$/);
    if (kv) {
      const key = normalizeName(kv[1]);
      const value = kv[2].trim();
      const hit = NOTE_KEY_MAP.find(({ keys }) =>
        keys.some((k) => key === k || key.includes(k)),
      );
      if (hit) {
        (out as any)[hit.field] = value;
        continue;
      }
    }
    // Heuristic recovery when the fragment has no explicit key
    const low = normalizeName(frag);
    if (!out.original_date && /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/.test(frag)) {
      const iso = parseBRDate(frag.match(/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/)![0]);
      if (iso) { out.original_date = iso; continue; }
    }
    if (!out.file_name && /\.(pdf|jpe?g|png|xlsx?|csv|docx?)\b/i.test(frag)) {
      out.file_name = frag; continue;
    }
    if (!out.folder_path && /[\\/].+[\\/]/.test(frag)) {
      out.folder_path = frag; continue;
    }
    if (!out.payment_method && PAYMENT_METHODS.some((p) => low.includes(p))) {
      out.payment_method = frag; continue;
    }
    if (!out.bank && BANK_HINTS.some((b) => low.includes(b))) {
      out.bank = frag; continue;
    }
    if (!out.invoice_number && /\bfatura\b|\bnf[-\s]?\d/.test(low)) {
      out.invoice_number = frag; continue;
    }
    if (!out.page_number && /\bp[aá]g(ina)?\s*\d+\b/.test(low)) {
      out.page_number = frag.replace(/\D+/g, ""); continue;
    }
    out.extras.push(frag);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Row normalization
// ---------------------------------------------------------------------------

function relocateMisplacedFields(row: NormalizedRow) {
  // If date is empty but notes has original_date, promote it.
  if (!row.normalized.date && row.parsed_notes.original_date) {
    row.normalized.date = row.parsed_notes.original_date;
  }
  // If account is empty but notes has bank/card, use it as fallback.
  if (!row.normalized.account) {
    if (row.parsed_notes.card) row.normalized.account = row.parsed_notes.card;
    else if (row.parsed_notes.bank) row.normalized.account = row.parsed_notes.bank;
  }
  // Description defaults to counterparty; falls back to holder or file name.
  if (!row.normalized.description) {
    row.normalized.description =
      row.normalized.counterparty ??
      row.parsed_notes.holder ??
      row.parsed_notes.file_name ??
      undefined;
  }
  // If category is empty, try original_category from notes.
  if (!row.normalized.category && row.parsed_notes.original_category) {
    row.normalized.category = row.parsed_notes.original_category;
  }
}

export function normalizeRow(
  rawRow: unknown[],
  header: string[],
  mapping: ColumnMapping,
  absoluteRowNumber: number,
): NormalizedRow {
  const raw: Record<string, unknown> = {};
  header.forEach((h, i) => {
    raw[h || `col_${i + 1}`] = rawRow[i] ?? null;
  });

  const pick = (f: CanonicalField): unknown =>
    mapping[f] !== undefined ? rawRow[mapping[f]!] : undefined;

  const notesRaw = pick("notes");
  const parsed_notes = parseNotes(notesRaw);

  const row: NormalizedRow = {
    row_number: absoluteRowNumber,
    raw,
    normalized: {
      id: pick("id") != null ? String(pick("id")).trim() || undefined : undefined,
      amount: parseBRLNumber(pick("amount")) ?? undefined,
      amount_brl: parseBRLNumber(pick("amount_brl")) ?? undefined,
      currency: pick("currency")
        ? String(pick("currency")).trim().toUpperCase() || undefined
        : undefined,
      category: pick("category") ? String(pick("category")).trim() || undefined : undefined,
      account: pick("account") ? String(pick("account")).trim() || undefined : undefined,
      date: parseBRDate(pick("date")) ?? undefined,
      counterparty: pick("counterparty")
        ? String(pick("counterparty")).trim() || undefined
        : undefined,
      notes: notesRaw ? String(notesRaw).trim() || undefined : undefined,
    },
    parsed_notes,
    status: "ok",
  };

  relocateMisplacedFields(row);

  // Validation
  if (row.normalized.amount === undefined && row.normalized.amount_brl === undefined) {
    row.status = "error";
    row.error = "Valor não identificado";
  } else if (!row.normalized.date) {
    row.status = "warning";
    row.error = "Data ausente";
  }

  return row;
}

export function normalizeAll(
  matrix: unknown[][],
  detection: HeaderDetection,
): NormalizedRow[] {
  const rows: NormalizedRow[] = [];
  for (let i = detection.headerRow + 1; i < matrix.length; i++) {
    const raw = matrix[i] ?? [];
    const nonEmpty = raw.some((c) => c !== null && c !== undefined && String(c).trim() !== "");
    if (!nonEmpty) continue;
    rows.push(normalizeRow(raw, detection.header, detection.mapping, i + 1));
  }
  return rows;
}