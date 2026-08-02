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

/**
 * Supabase Storage rejeita chaves com acentos, espaços finais e caracteres
 * especiais ("Invalid key"). O nome original continua salvo em `file_name`;
 * apenas a CHAVE do armazenamento é normalizada para ASCII seguro.
 */
export function storageSafeName(name: string): string {
  const ext = extOf(name);
  const base = (ext ? name.slice(0, name.length - ext.length - 1) : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  const safeExt = ext.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  const safeBase = base || "arquivo";
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
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

import { parseMoneyToCents } from "@/lib/format";

function parseBrlNumber(raw: string): number | null {
  const cents = parseMoneyToCents(raw);
  return cents !== null ? cents / 100 : null;
}

/**
 * Robust BRL amount parser.
 * Centralizado para retornar floats (mantido para compatibilidade onde necessário).
 */
export function parseBrlAmount(raw: string | number | null | undefined): number | null {
  const cents = parseMoneyToCents(raw);
  return cents !== null ? cents / 100 : null;
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
  signal?: AbortSignal;
};

// Limites de segurança contra "ZIP bomb" e arquivos absurdos.
const MAX_ZIP_ENTRIES = 5000;
const MAX_ENTRY_BYTES = 60 * 1024 * 1024; // 60 MB por arquivo
const MAX_TOTAL_BYTES = 800 * 1024 * 1024; // 800 MB descompactados por lote
// Páginas por PDF que podem passar por OCR (evita travar o navegador).
const MAX_OCR_PAGES = 20;

export async function extractZipToStorage(opts: ExtractOptions): Promise<{
  filesTotal: number;
  filesErrors: number;
}> {
  const { batchId, userId, file, onProgress, signal } = opts;

  const zip = await JSZip.loadAsync(file);
  const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (isSystemPath(path)) return;
    const clean = sanitizePath(path);
    if (!clean) return;
    entries.push({ path: clean, entry });
  });

  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(
      `O ZIP contém ${entries.length} arquivos, acima do limite de ${MAX_ZIP_ENTRIES}. Divida o envio em partes menores.`,
    );
  }

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
  let totalBytes = 0;

  for (const { path, entry } of entries) {
    if (signal?.aborted) break;
    progress.currentFile = path;
    try {
      const blob = await entry.async("blob");
      const buf = await blob.arrayBuffer();
      if (buf.byteLength > MAX_ENTRY_BYTES) {
        throw new Error(
          `Arquivo maior que o limite de ${Math.round(MAX_ENTRY_BYTES / 1024 / 1024)} MB`,
        );
      }
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          `Conteúdo descompactado passou de ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB. Envio interrompido por segurança.`,
        );
      }
      const hash = await sha256Hex(buf);
      const name = path.split("/").pop() ?? path;
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const ext = extOf(name);
      const mime = blob.type || guessMime(ext);

      // Duplicidade por conteúdo: sempre aponte para o arquivo ORIGINAL
      // (o canônico, que tem duplicate_of nulo e caminho real no armazenamento).
      const { data: canonicals } = await supabase
        .from("import_files")
        .select("id, storage_path")
        .eq("user_id", userId)
        .eq("content_hash", hash)
        .is("duplicate_of", null)
        .not("storage_path", "is", null)
        .order("created_at", { ascending: true })
        .limit(1);
      const existing = canonicals?.[0] ?? null;

      // Upload to private storage — chave SEMPRE ASCII segura ("Invalid key").
      const storagePath = `import/${userId}/${batchId}/${hash.slice(0, 2)}/${hash}-${storageSafeName(name)}`;
      let uploadedPath = storagePath;
      if (!existing) {
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(storagePath, blob, {
            contentType: mime,
            upsert: true,
          });
        if (upErr) {
          // Último recurso: chave mínima, apenas hash + extensão.
          const fallbackPath = `import/${userId}/${batchId}/${hash.slice(0, 2)}/${hash}${ext ? `.${ext.replace(/[^a-z0-9]/gi, "")}` : ""}`;
          const { error: fbErr } = await supabase.storage
            .from("receipts")
            .upload(fallbackPath, blob, { contentType: mime, upsert: true });
          if (fbErr) throw upErr;
          uploadedPath = fallbackPath;
        }
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
        storage_path: existing ? null : uploadedPath,
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
        exclusion_reason: "falha no envio do arquivo ao armazenamento",
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

  // Duplicatas herdam os fatos do arquivo canônico já processado, para que
  // participem da conciliação e nunca apareçam como "não processadas".
  await hydrateDuplicateFiles(batchId);

  return { filesTotal: entries.length, filesErrors: errors };
}

// -----------------------------------------------------------------------------
// Duplicatas: copiam texto/fatos/tipo do arquivo original (mesmo content_hash)
// -----------------------------------------------------------------------------

export async function hydrateDuplicateFiles(batchId: string): Promise<number> {
  const { data: dups } = await supabase
    .from("import_files")
    .select("id, duplicate_of, extracted_text, ocr_data, document_type")
    .eq("batch_id", batchId)
    .not("duplicate_of", "is", null);

  const pending = (dups ?? []).filter((d: any) => !d.extracted_text || !d.ocr_data);
  if (!pending.length) return 0;

  const parentIds = [...new Set(pending.map((d: any) => d.duplicate_of as string))];
  const parents = new Map<string, any>();
  for (let i = 0; i < parentIds.length; i += 200) {
    const { data } = await supabase
      .from("import_files")
      .select("id, extracted_text, ocr_data, page_count, document_type, readable")
      .in("id", parentIds.slice(i, i + 200));
    for (const p of data ?? []) parents.set(p.id, p);
  }

  let updated = 0;
  for (const d of pending as any[]) {
    const p = parents.get(d.duplicate_of);
    if (!p) continue;
    const text = (p.extracted_text ?? null) as string | null;
    const { error } = await supabase
      .from("import_files")
      .update({
        extracted_text: d.extracted_text ?? text,
        ocr_data: d.ocr_data ?? p.ocr_data,
        page_count: p.page_count ?? null,
        readable: p.readable ?? (text ? text.trim().length >= 20 : null),
        document_type:
          d.document_type && d.document_type !== "unknown"
            ? d.document_type
            : (p.document_type ?? "unknown"),
      })
      .eq("id", d.id);
    if (!error) updated += 1;
  }
  return updated;
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
    // Processamento sequencial e individual para precisão máxima (comportamento de auditor)
    for (const f of list) {
      if (signal?.aborted) break;
      onProgress?.({ processed, total, pages, errors, current: f.original_path });
      
      // Delay artificial para garantir que o sistema não tente "correr" e errar
      // e para dar tempo de limpeza de memória se necessário
      await new Promise(resolve => setTimeout(resolve, 300));

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
          let ocrPages = 0;
          for (let p = 1; p <= doc.numPages; p += 1) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            let pageText = content.items
              .map((it: any) => ("str" in it ? it.str : ""))
              .join(" ");
            // PDFs mistos: cada página com pouco texto nativo é lida por OCR
            // individualmente, para não perder páginas digitalizadas.
            if (runOcr && worker && pageText.trim().length < 20 && ocrPages < MAX_OCR_PAGES) {
              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement("canvas");
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext("2d")!;
              await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
              const { data } = await worker.recognize(canvas);
              pageText = data.text ?? "";
              ocrPages += 1;
              canvas.width = 0;
              canvas.height = 0;
            }
            parts.push(pageText);
            pages += 1;
            onProgress?.({ processed, total, pages, errors, current: f.original_path });
          }
          extractedText = parts.join("\n\n");
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

        // Marca legibilidade — usa mais adiante para o bucket "ilegíveis".
        const readable = extractedText.trim().length >= 20;

        await supabase
          .from("import_files")
          .update({
            status: readable ? "processed" : "unreadable",
            readable,
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
            readable: false,
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
    (r) =>
      r.status === "processed" ||
      r.status === "error" ||
      r.status === "duplicate" ||
      r.status === "unreadable",
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