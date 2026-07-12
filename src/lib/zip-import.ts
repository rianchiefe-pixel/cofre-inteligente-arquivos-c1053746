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

        // Very light structured OCR heuristics
        if (extractedText) {
          const cpf = extractedText.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0];
          const cnpj = extractedText.match(
            /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
          )?.[0];
          const date = extractedText.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0];
          const value = extractedText.match(/R\$\s?[\d\.]+,\d{2}/)?.[0];
          const auth = extractedText.match(/(autentica[çc][ãa]o|c[oó]digo)[:\s]+([A-Z0-9]{6,})/i)?.[2];
          if (cpf) ocrData.cpf = cpf;
          if (cnpj) ocrData.cnpj = cnpj;
          if (date) ocrData.date = date;
          if (value) ocrData.value = value;
          if (auth) ocrData.auth_code = auth;
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