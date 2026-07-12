// ---------------------------------------------------------------------------
// Parte 4 — Localização automática dos comprovantes
//
// Cross-matches import_rows (linhas da planilha) with import_files (arquivos
// extraídos do ZIP) and persists candidatos em `import_row_files` com
// pontuação 0–100 + motivos, sem apagar nada — apenas marca para conferência.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

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

function amountsClose(a: unknown, b: unknown): boolean {
  const na = typeof a === "number" ? a : parseFloat(String(a));
  const nb = typeof b === "number" ? b : parseFloat(String(b));
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(Math.abs(na) - Math.abs(nb)) < 0.02;
}

function tierFor(score: number): MatchTier {
  if (score >= 90) return "very_high";
  if (score >= 75) return "high";
  if (score >= 55) return "review";
  if (score > 0) return "low";
  return "none";
}

// ---- Core scoring --------------------------------------------------------

interface FileFacts {
  id: string;
  original_path: string;
  folder: string | null;
  file_name: string;
  extracted_text: string;
  ocr: Record<string, unknown> | null;
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
  const ocr = (f.ocr_data ?? null) as Record<string, unknown> | null;
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
  let score = 0;

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
    if ((d && d.length >= 4 && (f.nameNorm.includes(d) || f.pathNorm.includes(d) || f.textNorm.includes(d))) ||
        (n && n.length >= 4 && (f.nameNorm.includes(n) || f.textNorm.includes(n)))) {
      score += 35;
      reasons.push({ key: "id", label: `ID/transação: ${id}`, points: 35 });
      break;
    }
  }

  // 3. Amount (25)
  const amt = typeof row.amount === "number" ? row.amount : parseFloat(String(row.amount ?? ""));
  if (Number.isFinite(amt) && amt !== 0) {
    const cents = Math.round(Math.abs(amt) * 100).toString();
    // R$ 1.234,56 → 1234,56 / 1.234,56 / 123456
    const withComma = Math.abs(amt).toFixed(2).replace(".", ",");
    const withDot = Math.abs(amt).toFixed(2);
    const hay = `${f.file_name} ${f.extracted_text}`;
    const ocrAmt = f.ocr && (f.ocr as any).amount;
    if (
      hay.includes(withComma) ||
      hay.includes(withDot) ||
      hay.replace(/\D/g, "").includes(cents) ||
      amountsClose(amt, ocrAmt)
    ) {
      score += 25;
      reasons.push({ key: "amount", label: `valor R$ ${withComma}`, points: 25 });
    }
  }

  // 4. Date (20)  — YYYY-MM-DD or DDMMYYYY, plus month/folder-year check
  const date = String(row.transaction_date ?? "").trim();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-");
    const dmy = `${d}${m}${y}`;
    const dmy2 = `${d}/${m}/${y}`;
    const ymd = `${y}${m}${d}`;
    const hay = `${f.file_name} ${f.pathNorm} ${f.extracted_text}`;
    if (hay.includes(date) || hay.includes(dmy) || hay.includes(dmy2) || hay.includes(ymd) || f.pathNorm.includes(`${y} ${m}`) || f.pathNorm.includes(`${m} ${y}`)) {
      score += 20;
      reasons.push({ key: "date", label: `data ${date}`, points: 20 });
    }
  }

  // 5. Payee (15)
  const payee = String(row.payee ?? row.description ?? "").trim();
  if (payee) {
    const ov = tokenOverlap(tokens(payee), f.tokens);
    if (ov >= 0.5) {
      score += 15;
      reasons.push({ key: "payee", label: `favorecido semelhante: ${payee}`, points: 15 });
    } else if (ov >= 0.25) {
      score += 7;
      reasons.push({ key: "payee-partial", label: `favorecido parcial: ${payee}`, points: 7 });
    }
  }

  // 6. Bank (8) + card (8)
  const bank = String(row.bank ?? "").trim();
  if (bank) {
    const bn = norm(bank);
    if (bn && (f.textNorm.includes(bn) || f.nameNorm.includes(bn) || f.pathNorm.includes(bn))) {
      score += 8;
      reasons.push({ key: "bank", label: `mesmo banco: ${bank}`, points: 8 });
    }
  }
  const cardTail = String(row.card_last4 ?? "").replace(/\D/g, "");
  if (cardTail.length === 4) {
    const hay = `${f.file_name} ${f.extracted_text}`;
    if (hay.includes(cardTail)) {
      score += 8;
      reasons.push({ key: "card", label: `final do cartão ${cardTail}`, points: 8 });
    }
  }

  // 7. Holder (8)
  const holder = String(row.holder ?? "").trim();
  if (holder) {
    const ov = tokenOverlap(tokens(holder), f.tokens);
    if (ov >= 0.5) {
      score += 8;
      reasons.push({ key: "holder", label: `mesmo titular: ${holder}`, points: 8 });
    }
  }

  // 8. Payment method (5)
  const pm = String(row.payment_method ?? "").trim();
  if (pm) {
    const pn = norm(pm);
    if (pn && (f.textNorm.includes(pn) || f.nameNorm.includes(pn))) {
      score += 5;
      reasons.push({ key: "pm", label: `forma de pagamento ${pm}`, points: 5 });
    }
  }

  if (score <= 0) return null;
  if (score > 100) score = 100;

  // Prefer page from row hint, else file name hint
  const pageHint = extractPageHint(row.page_number) ?? f.pageHint ?? null;

  return {
    fileId: f.id,
    pageNumber: pageHint,
    score,
    confidence: tierFor(score),
    reasons,
  };
}

// ---- Public API ----------------------------------------------------------

export interface MatchProgress {
  rowsTotal: number;
  rowsDone: number;
  matched: number;
  needsReview: number;
  notFound: number;
}

export async function matchBatchReceipts(
  batchId: string,
  opts: { onProgress?: (p: MatchProgress) => void; topN?: number } = {},
): Promise<MatchProgress> {
  const topN = opts.topN ?? 5;

  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) throw new Error("Sessão expirada");

  const [{ data: rows }, { data: files }] = await Promise.all([
    supabase.from("import_rows").select("*").eq("batch_id", batchId).limit(5000),
    supabase
      .from("import_files")
      .select("id, file_name, original_path, folder, extension, extracted_text, ocr_data, page_count")
      .eq("batch_id", batchId)
      .in("status", ["ready", "processed", "completed", "done"])
      .limit(5000),
  ]);

  const rowList = rows ?? [];
  const fileFacts = (files ?? []).map(factsFromFile);

  // Wipe previous auto matches for this batch (keep manual ones)
  await supabase
    .from("import_row_files")
    .delete()
    .eq("batch_id", batchId)
    .eq("is_manual", false);

  const progress: MatchProgress = {
    rowsTotal: rowList.length,
    rowsDone: 0,
    matched: 0,
    needsReview: 0,
    notFound: 0,
  };

  for (const row of rowList) {
    const scored: Candidate[] = [];
    for (const f of fileFacts) {
      const c = scoreRowAgainstFile(row, f);
      if (c) scored.push(c);
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topN);

    if (top.length === 0) {
      progress.notFound++;
    } else if (top[0].score >= 75) {
      progress.matched++;
    } else {
      progress.needsReview++;
    }

    if (top.length > 0) {
      const payload = top.map((c, i) => ({
        user_id: userId,
        batch_id: batchId,
        row_id: row.id,
        file_id: c.fileId,
        page_number: c.pageNumber,
        score: c.score,
        confidence: c.confidence,
        match_reasons: c.reasons,
        is_manual: false,
        is_primary: i === 0 && c.score >= 75,
      }));
      await supabase.from("import_row_files").upsert(payload as any, {
        onConflict: "row_id,file_id,page_number",
      });
    }

    progress.rowsDone++;
    if (opts.onProgress && progress.rowsDone % 5 === 0) opts.onProgress({ ...progress });
  }

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

  if (input.makePrimary) {
    await supabase
      .from("import_row_files")
      .update({ is_primary: false })
      .eq("row_id", input.rowId);
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
  await supabase.from("import_row_files").update({ is_primary: false }).eq("row_id", rowId);
  await supabase.from("import_row_files").update({ is_primary: true }).eq("id", linkId);
}