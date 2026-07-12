import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

// -----------------------------------------------------------------------------
// Constants & helpers
// -----------------------------------------------------------------------------

const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
  "tif",
  "tiff",
  "bmp",
  "gif",
]);
const PDF_EXTS = new Set(["pdf"]);

const SYSTEM_PREFIXES = ["__macosx/", ".ds_store", "thumbs.db", "desktop.ini"];

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isSystemPath(p: string): boolean {
  const lower = p.toLowerCase();
  if (lower.split("/").some((seg) => seg.startsWith(".") && seg !== "")) return true;
  return SYSTEM_PREFIXES.some((s) => lower.includes(s));
}

/** Reject ZIP-slip / absolute paths / .. traversal. Returns sanitized relative path or null. */
function sanitizePath(p: string): string | null {
  if (!p) return null;
  let clean = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.includes("..")) return null;
  if (/^[a-zA-Z]:/.test(clean)) return null;
  clean = clean.replace(/\/+/g, "/");
  return clean;
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    tif: "image/tiff",
    tiff: "image/tiff",
    bmp: "image/bmp",
    gif: "image/gif",
  };
  return map[ext] ?? "application/octet-stream";
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// -----------------------------------------------------------------------------
// Receipt fact extraction — parses OCR/PDF text into structured fields the
// matcher can compare deterministically against a spreadsheet row.
// -----------------------------------------------------------------------------

function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ \t]+/g, " ");
}

function parseBrlNumber(raw: string): number | null {
  return parseBrlAmount(raw);
}

// ---------------------------------------------------------------------------
// Robust BRL amount parser.
//
// Regras (padrão brasileiro):
//   • vírgula = separador decimal
//   • ponto   = separador de milhar
//   • remove apenas "R$", espaços (incl. NBSP/thin) e caracteres não numéricos
//     acessórios; preserva centavos
//
// Também corrige erros comuns de OCR:
//   • "5.33"     → 5,33   (OCR trocou vírgula por ponto)
//   • "1 700,00" → 1700,00
//   • "1.700"    → 1700   (ponto como separador de milhar)
//   • "533" quando o texto exibe "5,33" — não sabemos sem outra referência,
//     então NÃO inventamos vírgula: retornamos 533 e deixamos a comparação
//     com a planilha divergir explicitamente.
// ---------------------------------------------------------------------------
export function parseBrlAmount(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  // strip currency + all whitespace variants (regular, NBSP, thin, narrow-nbsp)
  s = s
    .replace(/R\$/gi, "")
    .replace(/[\s\u00A0\u2007\u202F\u2009]/g, "")
    .replace(/[^0-9.,\-]/g, "");
  if (!s) return null;
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // "1.700,00" — ponto = milhar, vírgula = decimal.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "5,33" ou "1500,75" — vírgula sempre decimal.
    // Se por engano vieram várias vírgulas, mantém a última como decimal.
    const parts = s.split(",");
    const dec = parts.pop()!;
    normalized = parts.join("") + "." + dec;
  } else if (hasDot) {
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    if (parts.length === 2 && (last.length === 1 || last.length === 2)) {
      // "5.33" / "5.3" — OCR trocou vírgula por ponto → decimal.
      normalized = parts[0] + "." + last;
    } else {
      // "1.700" / "1.234.567" — pontos = separador de milhar.
      normalized = parts.join("");
    }
  } else {
    normalized = s;
  }

  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function parseDateBR(raw: string): string | null {
  const m = raw.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{2,4})/);
  if (!m) return null;
  const d = m[1], mo = m[2];
  let y = m[3];
  if (y.length === 2) y = (parseInt(y, 10) > 60 ? "19" : "20") + y;
  return `${y}-${mo}-${d}`;
}

const BANK_ALIASES: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "itau", patterns: [/ita[uú]/i] },
  { key: "bradesco", patterns: [/bradesco/i] },
  { key: "santander", patterns: [/santander/i] },
  { key: "bb", patterns: [/banco do brasil|\bbb\b|001\b/i] },
  { key: "caixa", patterns: [/caixa econ|\bcef\b|caixa\b/i] },
  { key: "nubank", patterns: [/nubank|nu pagamentos/i] },
  { key: "inter", patterns: [/banco inter|\binter\b/i] },
  { key: "safra", patterns: [/safra/i] },
  { key: "sicredi", patterns: [/sicredi/i] },
  { key: "sicoob", patterns: [/sicoob/i] },
  { key: "btg", patterns: [/\bbtg\b/i] },
  { key: "c6", patterns: [/\bc6\b/i] },
  { key: "original", patterns: [/banco original/i] },
  { key: "next", patterns: [/\bnext\b/i] },
  { key: "pan", patterns: [/banco pan/i] },
  { key: "will", patterns: [/will bank/i] },
  { key: "mercadopago", patterns: [/mercado pago|mercadopago/i] },
  { key: "pagseguro", patterns: [/pagseguro|pagbank/i] },
  { key: "picpay", patterns: [/picpay/i] },
];

export function normalizeBank(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw);
  for (const b of BANK_ALIASES) if (b.patterns.some((p) => p.test(s))) return b.key;
  return null;
}

function detectBanks(text: string): string[] {
  const found = new Set<string>();
  for (const b of BANK_ALIASES) if (b.patterns.some((p) => p.test(text))) found.add(b.key);
  return [...found];
}

function detectPaymentMethod(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bpix\b/.test(t)) return "pix";
  if (/boleto|c[oó]d(?:igo)?\s*de\s*barras/.test(t)) return "boleto";
  if (/cart[aã]o\s+de\s+cr[eé]dito|credito/.test(t)) return "cartao_credito";
  if (/cart[aã]o\s+de\s+d[eé]bito|debito/.test(t)) return "cartao_debito";
  if (/ted\b|doc\b|transfer[eê]ncia/.test(t)) return "transferencia";
  if (/dinheiro|esp[eé]cie/.test(t)) return "dinheiro";
  return null;
}

function extractLabeled(text: string, labels: RegExp): string | null {
  const re = new RegExp(
    `(?:${labels.source})\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ0-9 &.'\\-]{3,80})`,
    "i",
  );
  const m = text.match(re);
  return m ? m[1].trim().replace(/\s{2,}/g, " ") : null;
}

export interface ReceiptFacts {
  amount?: number;
  amount_raw?: string;
  date?: string; // ISO
  time?: string;
  payer?: string;
  payee?: string;
  bank_from?: string;
  bank_to?: string;
  banks?: string[];
  payment_method?: string;
  cpf?: string[];
  cnpj?: string[];
  auth_code?: string;
  transaction_id?: string;
  description?: string;
}

export function extractReceiptFacts(rawText: string): ReceiptFacts {
  const text = normText(rawText);
  const facts: ReceiptFacts = {};

  // Amount — capture any BRL-looking number, prefer largest (transaction total).
  // Aceita "R$ 5,33", "R$ 1.700,00", "R$ 5.33" (OCR errado), "R$ 1 700,00".
  const amtRegex = /R\$\s?([\d.,\s\u00A0\u2007\u202F\u2009]{1,20}\d)/gi;
  const amounts: Array<{ raw: string; n: number }> = [];
  for (const m of text.matchAll(amtRegex)) {
    const n = parseBrlAmount(m[1]);
    if (n !== null && n > 0) amounts.push({ raw: m[0].trim(), n });
  }
  if (amounts.length) {
    amounts.sort((a, b) => b.n - a.n);
    facts.amount = amounts[0].n;
    facts.amount_raw = amounts[0].raw;
  }

  // Date/time
  const date = text.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{2,4})\b/);
  if (date) {
    const iso = parseDateBR(date[0]);
    if (iso) facts.date = iso;
  }
  const time = text.match(/\b(\d{2}):(\d{2})(?::(\d{2}))?\b/);
  if (time) facts.time = time[0];

  // Documents
  const cpfs = [...text.matchAll(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g)].map((m) => m[0]);
  if (cpfs.length) facts.cpf = [...new Set(cpfs)];
  const cnpjs = [...text.matchAll(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g)].map((m) => m[0]);
  if (cnpjs.length) facts.cnpj = [...new Set(cnpjs)];

  // Auth/transaction ids
  const auth = text.match(/(?:autentica[cç][aã]o|c[oó]digo\s*de\s*autentica[cç][aã]o)\s*[:\-]?\s*([A-Z0-9.\-]{6,})/i);
  if (auth) facts.auth_code = auth[1];
  const tx = text.match(/(?:id\s*(?:da\s*)?transa[cç][aã]o|transaction\s*id|end\s*to\s*end|e2e|nsu)\s*[:\-]?\s*([A-Z0-9.\-]{6,})/i);
  if (tx) facts.transaction_id = tx[1];

  // People / institutions
  const payee = extractLabeled(text, /favorecido|destinat[aá]rio|recebedor|para|beneficiario|beneficiário/);
  if (payee) facts.payee = payee;
  const payer = extractLabeled(text, /pagador|titular|origem|de|remetente|pagante/);
  if (payer) facts.payer = payer;

  const bankFromLabel = extractLabeled(text, /banco\s*(?:de\s*)?origem|institui[cç][aã]o\s*de\s*origem|banco\s*do\s*pagador/);
  const bankToLabel = extractLabeled(text, /banco\s*(?:de\s*)?destino|institui[cç][aã]o\s*de\s*destino|banco\s*do\s*favorecido|banco\s*do\s*recebedor/);
  const bankFrom = normalizeBank(bankFromLabel);
  const bankTo = normalizeBank(bankToLabel);
  if (bankFrom) facts.bank_from = bankFrom;
  if (bankTo) facts.bank_to = bankTo;
  const banks = detectBanks(text);
  if (banks.length) facts.banks = banks;

  const pm = detectPaymentMethod(text);
  if (pm) facts.payment_method = pm;

  const desc = extractLabeled(text, /descri[cç][aã]o|hist[oó]rico|mensagem|finalidade/);
  if (desc) facts.description = desc;

  return facts;
}

// -----------------------------------------------------------------------------
// Progress model (persistable)
// -----------------------------------------------------------------------------

export type ZipProgress = {
  filesFound: number;
  filesProcessed: number;
  pdfsRead: number;
  imagesRead: number;
  pagesProcessed: number;
  errors: number;
  currentFile?: string;
  percent: number;
};

export type ZipProgressCallback = (p: ZipProgress) => void;

// -----------------------------------------------------------------------------
// Extraction pass — creates one import_files row per file, uploads to storage
// -----------------------------------------------------------------------------

export type ExtractOptions = {
  batchId: string;
  userId: string;
  file: File;
  runOcr?: boolean;
  onProgress?: ZipProgressCallback;
};

export async function extractZipToStorage(opts: ExtractOptions): Promise<{
  filesTotal: number;
  filesErrors: number;
}> {
  const { batchId, userId, file, onProgress } = opts;

  const zip = await JSZip.loadAsync(file);
  const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (isSystemPath(path)) return;
    const clean = sanitizePath(path);
    if (!clean) return;
    entries.push({ path: clean, entry });
  });

  const progress: ZipProgress = {
    filesFound: entries.length,
    filesProcessed: 0,
    pdfsRead: 0,
    imagesRead: 0,
    pagesProcessed: 0,
    errors: 0,
    percent: 0,
  };
  onProgress?.(progress);

  let errors = 0;

  for (const { path, entry } of entries) {
    progress.currentFile = path;
    try {
      const blob = await entry.async("blob");
      const buf = await blob.arrayBuffer();
      const hash = await sha256Hex(buf);
      const name = path.split("/").pop() ?? path;
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const ext = extOf(name);
      const mime = blob.type || guessMime(ext);

      // Duplicate detection (same hash for this user)
      const { data: existing } = await supabase
        .from("import_files")
        .select("id")
        .eq("user_id", userId)
        .eq("content_hash", hash)
        .maybeSingle();

      // Upload to private storage
      const storagePath = `import/${userId}/${batchId}/${hash.slice(0, 2)}/${hash}-${name}`;
      if (!existing) {
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(storagePath, blob, {
            contentType: mime,
            upsert: true,
          });
        if (upErr) throw upErr;
      }

      const { error: insErr } = await supabase.from("import_files").insert({
        batch_id: batchId,
        user_id: userId,
        original_path: path,
        folder,
        file_name: name,
        extension: ext,
        mime_type: mime,
        size_bytes: buf.byteLength,
        content_hash: hash,
        storage_path: existing ? null : storagePath,
        duplicate_of: existing?.id ?? null,
        status: existing ? "duplicate" : "uploaded",
      });
      if (insErr) throw insErr;

      if (PDF_EXTS.has(ext)) progress.pdfsRead += 1;
      else if (IMAGE_EXTS.has(ext)) progress.imagesRead += 1;
    } catch (e) {
      errors += 1;
      progress.errors = errors;
      await supabase.from("import_files").insert({
        batch_id: batchId,
        user_id: userId,
        original_path: path,
        file_name: path.split("/").pop() ?? path,
        extension: extOf(path),
        status: "error",
        error_message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      progress.filesProcessed += 1;
      progress.percent = Math.round(
        (progress.filesProcessed / Math.max(progress.filesFound, 1)) * 100,
      );
      onProgress?.(progress);
    }
  }

  await supabase
    .from("import_batches")
    .update({
      files_total: entries.length,
      files_processed: progress.filesProcessed,
      files_errors: errors,
    })
    .eq("id", batchId);

  return { filesTotal: entries.length, filesErrors: errors };
}

// -----------------------------------------------------------------------------
// Post-processing (PDF text + optional OCR). Idempotent, resumable.
// -----------------------------------------------------------------------------

export type ProcessOptions = {
  batchId: string;
  userId: string;
  runOcr: boolean;
  onProgress?: (p: {
    processed: number;
    total: number;
    pages: number;
    errors: number;
    current?: string;
  }) => void;
  signal?: AbortSignal;
};

export async function processZipFiles(opts: ProcessOptions): Promise<void> {
  const { batchId, userId, runOcr, onProgress, signal } = opts;

  const { data: files } = await supabase
    .from("import_files")
    .select("id, storage_path, extension, original_path, mime_type")
    .eq("batch_id", batchId)
    .eq("user_id", userId)
    .eq("status", "uploaded")
    .order("created_at");

  const list = files ?? [];
  const total = list.length;
  let processed = 0;
  let pages = 0;
  let errors = 0;

  const pdfjs = PDF_EXTS.size
    ? await import("pdfjs-dist").then((m) => {
        m.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        return m;
      })
    : null;

  let worker: any = null;
  if (runOcr) {
    const tesseract = await import("tesseract.js");
    worker = await tesseract.createWorker("por+eng");
  }

  try {
    for (const f of list) {
      if (signal?.aborted) break;
      onProgress?.({ processed, total, pages, errors, current: f.original_path });
      try {
        const path = f.storage_path;
        if (!path) throw new Error("Sem caminho no storage");
        const { data: signed } = await supabase.storage
          .from("receipts")
          .createSignedUrl(path, 60 * 10);
        if (!signed?.signedUrl) throw new Error("Sem URL assinada");

        const ext = (f.extension ?? "").toLowerCase();
        let extractedText = "";
        let pageCount: number | undefined;
        const ocrData: Record<string, unknown> = {};

        if (PDF_EXTS.has(ext) && pdfjs) {
          const task = pdfjs.getDocument({ url: signed.signedUrl });
          const doc = await task.promise;
          pageCount = doc.numPages;
          const parts: string[] = [];
          for (let p = 1; p <= doc.numPages; p += 1) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            const pageText = content.items
              .map((it: any) => ("str" in it ? it.str : ""))
              .join(" ");
            parts.push(pageText);
            pages += 1;
            onProgress?.({ processed, total, pages, errors, current: f.original_path });
          }
          extractedText = parts.join("\n\n");

          // Fallback OCR when native text is empty
          if (runOcr && worker && extractedText.trim().length < 20) {
            const first = await doc.getPage(1);
            const viewport = first.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d")!;
            await first.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            const { data } = await worker.recognize(canvas);
            extractedText = data.text;
          }
        } else if (IMAGE_EXTS.has(ext)) {
          if (runOcr && worker) {
            const { data } = await worker.recognize(signed.signedUrl);
            extractedText = data.text;
          }
        }

        // Structured OCR extraction — everything the matcher needs to
        // cross-check a receipt against a spreadsheet row.
        if (extractedText) {
          Object.assign(ocrData, extractReceiptFacts(extractedText));
        }

        await supabase
          .from("import_files")
          .update({
            status: "processed",
            extracted_text: extractedText.slice(0, 100_000) || null,
            page_count: pageCount ?? null,
            ocr_data: (Object.keys(ocrData).length ? ocrData : null) as any,
            progress: 100,
          })
          .eq("id", f.id);
      } catch (e) {
        errors += 1;
        await supabase
          .from("import_files")
          .update({
            status: "error",
            error_message: e instanceof Error ? e.message : String(e),
          })
          .eq("id", f.id);
      } finally {
        processed += 1;
        onProgress?.({ processed, total, pages, errors, current: f.original_path });
      }
    }

    await supabase
      .from("import_batches")
      .update({
        files_processed: processed,
        files_errors: errors,
        pdf_pages_processed: pages,
      })
      .eq("id", batchId);
  } finally {
    if (worker) await worker.terminate();
  }
}

// -----------------------------------------------------------------------------
// Resume snapshot: derives progress from DB, so refresh doesn't lose state
// -----------------------------------------------------------------------------

export async function getZipSnapshot(batchId: string): Promise<ZipProgress> {
  const { data } = await supabase
    .from("import_files")
    .select("status, extension, page_count")
    .eq("batch_id", batchId);
  const rows = data ?? [];
  const filesFound = rows.length;
  const filesProcessed = rows.filter(
    (r) => r.status === "processed" || r.status === "error" || r.status === "duplicate",
  ).length;
  const errors = rows.filter((r) => r.status === "error").length;
  const pdfsRead = rows.filter((r) => (r.extension ?? "").toLowerCase() === "pdf").length;
  const imagesRead = rows.filter((r) =>
    IMAGE_EXTS.has((r.extension ?? "").toLowerCase()),
  ).length;
  const pagesProcessed = rows.reduce((s, r) => s + (r.page_count ?? 0), 0);
  return {
    filesFound,
    filesProcessed,
    pdfsRead,
    imagesRead,
    pagesProcessed,
    errors,
    percent: filesFound ? Math.round((filesProcessed / filesFound) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Reprocessa OCR facts (valor, data, favorecido, banco, etc.) sobre o
// `extracted_text` já persistido — usa o parser BRL corrigido para
// re-normalizar valores sem precisar reler o PDF/imagem.
// ---------------------------------------------------------------------------
export async function reprocessBatchFacts(
  batchId: string,
  onProgress?: (p: { done: number; total: number }) => void,
): Promise<{ updated: number; total: number }> {
  const { data: files } = await supabase
    .from("import_files")
    .select("id, extracted_text")
    .eq("batch_id", batchId)
    .not("extracted_text", "is", null);

  const list = files ?? [];
  let done = 0;
  let updated = 0;
  for (const f of list) {
    const text = String(f.extracted_text ?? "");
    if (text.trim()) {
      const facts = extractReceiptFacts(text);
      const { error } = await supabase
        .from("import_files")
        .update({ ocr_data: (Object.keys(facts).length ? facts : null) as any })
        .eq("id", f.id);
      if (!error) updated += 1;
    }
    done += 1;
    onProgress?.({ done, total: list.length });
  }
  return { updated, total: list.length };
}