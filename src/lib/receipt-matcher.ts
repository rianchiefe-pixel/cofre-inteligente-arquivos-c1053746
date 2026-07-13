// ---------------------------------------------------------------------------
// Parte 4 — Localização automática dos comprovantes
//
// Cross-matches import_rows (linhas da planilha) with import_files (arquivos
// extraídos do ZIP) and persists candidatos em `import_row_files` com
// pontuação 0–100 + motivos, sem apagar nada — apenas marca para conferência.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { formatBrlNumber, parseBrlAmount } from "@/lib/format";
import { normalizeBank, type ReceiptFacts } from "@/lib/zip-import";

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
  matched?: string[];
  divergent?: string[];
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
  const na = parseBrlAmount(a);
  const nb = parseBrlAmount(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs((na ?? 0) - (nb ?? 0)) < 0.02;
}

function tierFor(score: number): MatchTier {
  if (score >= 90) return "very_high";
  if (score >= 75) return "high";
  if (score >= 55) return "review";
  if (score > 0) return "low";
  return "none";
}

// The receipt only earns a primary association when the *core trio* matches:
// amount + exact date + payee. Anything below that fails closed as "not found".
function gatedTier(raw: number, matched: Set<string>): MatchTier {
  const coreOk = matched.has("amount") && matched.has("date") && matched.has("payee");
  const complementary = ["bank", "holder", "payment_method", "auth", "txid", "card", "doc"].some((k) => matched.has(k));
  if (coreOk && complementary && raw >= 70) return "very_high";
  if (coreOk) return "high";
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

  // 3. Amount (25) — exact BRL match only. Never use loose digit matching.
  const amt = parseBrlAmount(row.amount);
  if (Number.isFinite(amt) && amt !== 0) {
    const withComma = formatBrlNumber(amt);
    const plainComma = (amt ?? 0).toFixed(2).replace(".", ",");
    const withDot = (amt ?? 0).toFixed(2);
    const hay = `${f.file_name} ${f.extracted_text}`;
    const ocrAmounts = [ocr.amount, ocr.amount_raw].map(parseBrlAmount).filter((n): n is number => n !== null);
    if (
      ocrAmounts.some((ocrAmt) => amountsClose(amt, ocrAmt)) ||
      hay.includes(withComma) ||
      hay.includes(plainComma) ||
      hay.includes(withDot) ||
      hay.includes(`R$ ${withComma}`) ||
      hay.includes(`R$${withComma}`)
    ) {
      score += 25;
      reasons.push({ key: "amount", label: `valor R$ ${withComma}`, points: 25 });
      matched.add("amount");
    } else if (ocrAmounts.length > 0) {
      divergent.push(`valor diverge (planilha R$ ${withComma} × comprovante ${ocr.amount_raw ?? `R$ ${ocrAmounts[0].toFixed(2)}`})`);
    }
  } else {
    return null;
  }

  if (!matched.has("amount")) return null;

  // 4. Date (20) — compare against OCR-extracted ISO date first.
  const date = String(row.transaction_date ?? "").trim();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-");
    const dmy = `${d}${m}${y}`;
    const dmy2 = `${d}/${m}/${y}`;
    const dmy3 = `${d}-${m}-${y}`;
    const dmy4 = `${d}.${m}.${y}`;
    const ymd = `${y}${m}${d}`;
    const hay = `${f.file_name} ${f.original_path} ${f.extracted_text}`;
    if (ocr.date === date || hay.includes(date) || hay.includes(dmy) || hay.includes(dmy2) || hay.includes(dmy3) || hay.includes(dmy4) || hay.includes(ymd)) {
      score += 20;
      reasons.push({ key: "date", label: `data ${date}`, points: 20 });
      matched.add("date");
    } else if (ocr.date && ocr.date !== date) {
      divergent.push(`data diverge (planilha ${date} × comprovante ${ocr.date})`);
    }
  } else {
    return null;
  }

  if (!matched.has("date")) return null;

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
  } else {
    return null;
  }

  if (!matched.has("payee")) return null;

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
  const confidence = gatedTier(score, matched);
  if (!isAcceptedTier(confidence)) return null;

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
}

export async function matchBatchReceipts(
  batchId: string,
  opts: { onProgress?: (p: MatchProgress) => void; topN?: number } = {},
): Promise<MatchProgress> {
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

  const { data: manualPrimaries } = await supabase
    .from("import_row_files")
    .select("row_id, file_id")
    .eq("batch_id", batchId)
    .eq("is_manual", true)
    .eq("is_primary", true);
  const manualRows = new Set((manualPrimaries ?? []).map((l: any) => l.row_id));
  const reservedFiles = new Set((manualPrimaries ?? []).map((l: any) => l.file_id));

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

  const bestByRow = new Map<string, Candidate>();
  const fileClaims = new Map<string, string[]>();

  for (const row of rowList) {
    if (manualRows.has(row.id)) continue;
    const scored: Candidate[] = [];
    for (const f of fileFacts) {
      const c = scoreRowAgainstFile(row, f);
      if (c && isAcceptedTier(c.confidence) && !reservedFiles.has(c.fileId)) scored.push(c);
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

    const top = bestByRow.get(row.id);
    const claims = top ? (fileClaims.get(top.fileId) ?? []) : [];

    if (!top) {
      progress.notFound++;
    } else if (claims.length > 1) {
      // Fail closed: when the same receipt would serve more than one row,
      // none of the competing rows receives an automatic primary link.
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

  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    await supabase.from("import_row_files").upsert(chunk as any, {
      onConflict: "row_id,file_id,page_number",
    });
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