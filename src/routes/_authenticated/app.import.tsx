import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, FileSpreadsheet, Files, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCan, useRoles, hasPermission } from "@/lib/permissions";
import type { Database } from "@/integrations/supabase/types";

type ReceiptInsert = Database["public"]["Tables"]["receipts"]["Insert"];
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { History, Undo2, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/import")({
  head: () => ({ meta: [{ title: "Importação Inteligente — Meu Cofre" }] }),
  component: ImportPage,
});

type FieldKey =
  | "payment_date" | "amount" | "bank_name" | "recipient_name" | "category"
  | "description" | "file_name" | "auth_code" | "notes" | "transaction_type";

const FIELD_LABELS: Record<FieldKey, string> = {
  payment_date: "Data",
  amount: "Valor",
  bank_name: "Banco",
  recipient_name: "Destinatário",
  category: "Categoria",
  description: "Descrição",
  file_name: "Nome do comprovante",
  auth_code: "Código de autenticação",
  notes: "Observações",
  transaction_type: "Tipo",
};

const ALIASES: Record<FieldKey, string[]> = {
  payment_date: ["data", "data pagamento", "dt pagto", "data pgto", "dt", "date"],
  amount: ["valor", "valor pago", "r$", "valor r$", "amount", "vlr"],
  bank_name: ["banco", "conta origem", "instituicao", "instituição"],
  recipient_name: ["favorecido", "destinatário", "destinatario", "recebedor", "beneficiario", "beneficiário"],
  category: ["categoria", "grupo", "classificação", "classificacao"],
  description: ["descrição", "descricao", "historico", "histórico", "memo"],
  file_name: ["comprovante", "arquivo", "nome do arquivo", "nome do comprovante", "anexo"],
  auth_code: ["autenticação", "autenticacao", "código", "codigo", "auth", "id transacao"],
  notes: ["observações", "observacoes", "obs", "notas"],
  transaction_type: ["tipo", "natureza"],
};

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s);
  s = s.replace(/[^\d,.\-]/g, "");
  // Se tem vírgula e ponto, ponto é milhar
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  // Só vírgula → decimal BR
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return toISODate(v);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // ISO: AAAA-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // BR: DD/MM/AAAA
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function autoMap(headers: string[]): Record<FieldKey, string> {
  const out: Partial<Record<FieldKey, string>> = {};
  for (const [field, aliases] of Object.entries(ALIASES) as [FieldKey, string[]][]) {
    const found = headers.find((h) => aliases.some((a) => normalize(h).includes(normalize(a))));
    if (found) out[field] = found;
  }
  return out as Record<FieldKey, string>;
}

type Row = Record<string, unknown>;

type ParsedRow = {
  idx: number;
  raw: Row;
  payment_date: string | null;
  amount: number | null;
  bank_name: string | null;
  recipient_name: string | null;
  category: string | null;
  description: string | null;
  file_name: string | null;
  auth_code: string | null;
  notes: string | null;
  matchedFile?: File;
  matchScore: number;
  duplicate: boolean;
  errors: string[];
};

async function sha256(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ImportPage() {
  const can = useCan("importData");
  const [step, setStep] = useState(1);
  const [profileId, setProfileId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [unusedFiles, setUnusedFiles] = useState<File[]>([]);
  const [parsingSheet, setParsingSheet] = useState(false);
  const [extractingZip, setExtractingZip] = useState(false);
  const [crossing, setCrossing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [report, setReport] = useState<{ totalRows: number; imported: number; withReceipt: number; withoutReceipt: number; unusedFiles: number; duplicates: number; errors: number; validationErrors: number } | null>(null);

  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [],
  });

  const handleSheet = useCallback(async (f: File) => {
    setParsingSheet(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Planilha sem abas");
      // Ler cabeçalhos direto da 1ª linha para não perder colunas ausentes na 1ª linha de dados
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
      if (matrix.length < 2) throw new Error("Planilha vazia ou sem dados");
      const hdrs = (matrix[0] as unknown[]).map((h, i) => (h == null || String(h).trim() === "" ? `Coluna ${i + 1}` : String(h)));
      const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", blankrows: false });
      if (!json.length) throw new Error("Nenhuma linha de dados");
      setFile(f);
      setHeaders(hdrs);
      setRows(json);
      setMapping(autoMap(hdrs));
      setStep(2);
      toast.success(`Planilha carregada: ${json.length} linhas, ${hdrs.length} colunas`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler planilha");
    } finally {
      setParsingSheet(false);
    }
  }, []);

  const handleReceipts = useCallback(async (files: File[]) => {
    setExtractingZip(true);
    const out: File[] = [];
    for (const f of files) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(f);
          for (const entry of Object.values(zip.files)) {
            if (entry.dir) continue;
            const blob = await entry.async("blob");
            const name = entry.name.split("/").pop() ?? entry.name;
            if (name.startsWith(".") || name === "__MACOSX") continue;
            out.push(new File([blob], name, { type: blob.type }));
          }
        } catch {
          toast.error(`Falha ao extrair ${f.name}`);
        }
      } else {
        out.push(f);
      }
    }
    // Dedup por nome+tamanho
    setReceiptFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev];
      for (const f of out) {
        const k = `${f.name}:${f.size}`;
        if (!seen.has(k)) { seen.add(k); merged.push(f); }
      }
      return merged;
    });
    setExtractingZip(false);
    toast.success(`${out.length} comprovantes prontos`);
  }, []);

  const runCross = useCallback(async () => {
    setCrossing(true);
    const parsedRows: ParsedRow[] = rows.map((r, idx) => {
      const get = (k: FieldKey) => (mapping[k] ? r[mapping[k]] : undefined);
      const p: ParsedRow = {
        idx,
        raw: r,
        payment_date: parseDate(get("payment_date")),
        amount: parseAmount(get("amount")),
        bank_name: get("bank_name") ? String(get("bank_name")) : null,
        recipient_name: get("recipient_name") ? String(get("recipient_name")) : null,
        category: get("category") ? String(get("category")) : null,
        description: get("description") ? String(get("description")) : null,
        file_name: get("file_name") ? String(get("file_name")) : null,
        auth_code: get("auth_code") ? String(get("auth_code")) : null,
        notes: get("notes") ? String(get("notes")) : null,
        matchScore: 0,
        duplicate: false,
        errors: [],
      };
      if (!p.payment_date) p.errors.push("Data inválida");
      if (p.amount == null) p.errors.push("Valor inválido");
      return p;
    });

    // Detectar duplicidades com lançamentos existentes (mesmo usuário)
    const { data: existing } = await supabase
      .from("receipts")
      .select("amount, payment_date, recipient_name, auth_code, file_hash")
      .limit(5000);
    const existingKey = new Set<string>();
    for (const r of existing ?? []) {
      if (r.amount != null && r.payment_date) existingKey.add(`${r.payment_date}|${Number(r.amount).toFixed(2)}|${(r.recipient_name ?? "").toLowerCase()}`);
      if (r.auth_code) existingKey.add(`auth:${r.auth_code}`);
    }
    for (const p of parsedRows) {
      if (p.auth_code && existingKey.has(`auth:${p.auth_code}`)) p.duplicate = true;
      else if (p.payment_date && p.amount != null && existingKey.has(`${p.payment_date}|${p.amount.toFixed(2)}|${(p.recipient_name ?? "").toLowerCase()}`)) p.duplicate = true;
    }

    const usedFiles = new Set<File>();
    for (const p of parsedRows) {
      if (p.errors.length) continue;
      let best: { f: File; s: number } | undefined;
      for (const f of receiptFiles) {
        if (usedFiles.has(f)) continue;
        let score = 0;
        const fname = normalize(f.name.replace(/\.[^.]+$/, ""));
        if (p.file_name && normalize(p.file_name).replace(/\.[^.]+$/, "") === fname) score = 100;
        else if (p.auth_code && fname.includes(normalize(p.auth_code))) score = 100;
        else {
          if (p.amount != null) {
            const cents = p.amount.toFixed(2).replace(".", "");
            const whole = String(Math.round(p.amount));
            if (fname.includes(cents)) score += 35;
            else if (whole.length >= 3 && fname.includes(whole)) score += 25;
          }
          if (p.payment_date && fname.includes(p.payment_date.replace(/-/g, ""))) score += 25;
          if (p.recipient_name && fname.includes(normalize(p.recipient_name).slice(0, 6))) score += 25;
          if (p.bank_name && fname.includes(normalize(p.bank_name).slice(0, 4))) score += 10;
        }
        if (!best || score > best.s) best = { f, s: score };
      }
      if (best && best.s >= 50) {
        p.matchedFile = best.f;
        p.matchScore = best.s;
        usedFiles.add(best.f);
      }
    }
    setParsed(parsedRows);
    setUnusedFiles(receiptFiles.filter((f) => !usedFiles.has(f)));
    setCrossing(false);
    setStep(5);
  }, [rows, mapping, receiptFiles]);

  const identified = useMemo(() => parsed.filter((p) => p.matchedFile && p.matchScore >= 80), [parsed]);
  const partial = useMemo(() => parsed.filter((p) => p.matchedFile && p.matchScore < 80), [parsed]);
  const noReceipt = useMemo(() => parsed.filter((p) => !p.matchedFile && p.errors.length === 0), [parsed]);
  const withErrors = useMemo(() => parsed.filter((p) => p.errors.length > 0), [parsed]);
  const duplicates = useMemo(() => parsed.filter((p) => p.duplicate && p.errors.length === 0), [parsed]);

  const runImport = useCallback(async () => {
    if (!profileId) return toast.error("Selecione um perfil de destino");
    setImporting(true);
    setProgress(0);
    setProgressLabel("Preparando…");
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) { setImporting(false); return toast.error("Sessão expirada"); }

    const valid = parsed.filter((p) => p.errors.length === 0 && !p.duplicate);
    let imported = 0, withReceipt = 0, errors = 0;
    const inserts: ReceiptInsert[] = [];

    // Cria o registro do lote antes de importar
    const { data: batch, error: batchErr } = await supabase
      .from("import_batches")
      .insert({
        user_id: userId,
        profile_id: profileId,
        file_name: file?.name ?? null,
        total_rows: parsed.length,
        duplicate_count: duplicates.length,
        error_count: withErrors.length,
        status: "running",
        created_by: userId,
      })
      .select("id")
      .single();
    if (batchErr || !batch) {
      setImporting(false);
      console.error("batch create", batchErr);
      return toast.error("Falha ao registrar o lote de importação");
    }
    const batchId = batch.id;
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "import.batch.created",
      entity: "import_batch",
      entity_id: batchId,
      profile_id: profileId,
      note: `Lote iniciado: ${file?.name ?? "planilha"} · ${parsed.length} linhas`,
    });
    setProgressLabel("Enviando comprovantes…");

    for (let i = 0; i < valid.length; i++) {
      const p = valid[i];
      try {
        let filePath = `${userId}/import/${crypto.randomUUID()}.txt`;
        let fileName: string | null = p.file_name;
        let fileMime: string | null = null;
        let fileSize: number | null = null;
        let fileHash: string | null = null;

        if (p.matchedFile) {
          const buf = await p.matchedFile.arrayBuffer();
          fileHash = await sha256(buf);
          const ext = p.matchedFile.name.split(".").pop() ?? "bin";
          filePath = `${userId}/import/${crypto.randomUUID()}.${ext}`;
          const up = await supabase.storage.from("receipts").upload(filePath, p.matchedFile, { contentType: p.matchedFile.type });
          if (up.error) throw new Error(up.error.message);
          fileName = p.matchedFile.name;
          fileMime = p.matchedFile.type;
          fileSize = p.matchedFile.size;
          withReceipt++;
        }

        inserts.push({
          user_id: userId,
          profile_id: profileId,
          import_batch_id: batchId,
          file_path: filePath,
          file_name: fileName,
          file_mime: fileMime,
          file_size: fileSize,
          file_hash: fileHash,
          amount: p.amount,
          payment_date: p.payment_date,
          bank_name: p.bank_name,
          recipient_name: p.recipient_name,
          description: p.description,
          auth_code: p.auth_code,
          notes: p.notes,
          ocr_status: "queued",
          status: "pending",
        });
      } catch (e) {
        errors++;
        console.error("import row", i, e);
      }
      setProgress(Math.round(((i + 1) / valid.length) * 80));
    }

    // Batch insert em blocos de 100
    setProgressLabel("Registrando lançamentos…");
    for (let i = 0; i < inserts.length; i += 100) {
      const chunk = inserts.slice(i, i + 100);
      const { error, count } = await supabase.from("receipts").insert(chunk, { count: "exact" });
      if (error) { errors += chunk.length; console.error("batch insert", error); }
      else { imported += count ?? chunk.length; }
      setProgress(80 + Math.round(((i + chunk.length) / Math.max(inserts.length, 1)) * 20));
    }

    const finalReport = {
      totalRows: parsed.length,
      imported,
      withReceipt,
      withoutReceipt: Math.max(imported - withReceipt, 0),
      unusedFiles: unusedFiles.length,
      duplicates: duplicates.length,
      errors,
      validationErrors: withErrors.length,
    };

    await supabase.from("import_batches").update({
      status: errors > 0 ? "completed_with_errors" : "completed",
      imported_count: imported,
      with_receipt_count: withReceipt,
      without_receipt_count: Math.max(imported - withReceipt, 0),
      unused_files_count: unusedFiles.length,
      duplicate_count: duplicates.length,
      error_count: errors,
      finished_at: new Date().toISOString(),
      summary_json: finalReport as never,
    }).eq("id", batchId);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "import.batch.completed",
      entity: "import_batch",
      entity_id: batchId,
      profile_id: profileId,
      new_value: finalReport as never,
      note: `Importação concluída · ${imported} lançamentos`,
    });

    setReport(finalReport);
    setImporting(false);
    setProgress(100);
    setProgressLabel("Concluído");
    setStep(6);
    toast.success(`Importação concluída: ${imported} lançamentos`);
  }, [parsed, profileId, unusedFiles.length, duplicates.length, withErrors.length, file, duplicates, withErrors]);

  const exportPendingCSV = useCallback(() => {
    const rows = [
      ["data", "valor", "destinatario", "banco", "categoria", "descricao", "motivo"],
      ...noReceipt.map((p) => [p.payment_date ?? "", String(p.amount ?? ""), p.recipient_name ?? "", p.bank_name ?? "", p.category ?? "", p.description ?? "", "sem_comprovante"]),
      ...withErrors.map((p) => [p.payment_date ?? "", String(p.amount ?? ""), p.recipient_name ?? "", p.bank_name ?? "", p.category ?? "", p.description ?? "", p.errors.join("; ")]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "pendencias-importacao.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [noReceipt, withErrors]);

  if (!can) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Você não tem permissão para importar dados.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Importação Inteligente</h1>
        <p className="text-sm text-muted-foreground">Migre planilhas antigas com centenas de lançamentos e cruze automaticamente com seus comprovantes.</p>
      </header>

      <Tabs defaultValue="new" className="space-y-4">
        <TabsList>
          <TabsTrigger value="new"><UploadCloud className="h-4 w-4 mr-1" /> Nova importação</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-6">
      <ol className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
        {["Planilha", "Mapeamento", "Comprovantes", "Cruzamento", "Revisão", "Relatório"].map((label, i) => (
          <li key={label} className={`rounded-md border px-2 py-1.5 text-center ${step >= i + 1 ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 font-medium"><FileSpreadsheet className="h-4 w-4" /> Passo 1 — Envie a planilha</div>
          <Input type="file" accept=".xlsx,.xls,.csv" disabled={parsingSheet} onChange={(e) => e.target.files?.[0] && handleSheet(e.target.files[0])} />
          {parsingSheet && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo planilha…</div>}
          <p className="text-xs text-muted-foreground">Formatos aceitos: XLSX, XLS, CSV. O sistema lerá as colunas e mostrará uma prévia.</p>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">Passo 2 — Mapeamento de colunas</div>
            <Badge variant="secondary">{rows.length} linhas · {headers.length} colunas</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{FIELD_LABELS[k]}</Label>
                <Select value={mapping[k] ?? "__none__"} onValueChange={(v) => setMapping((m) => ({ ...m, [k]: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— não usar —</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader><TableRow>{headers.slice(0, 6).map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 5).map((r, i) => (
                  <TableRow key={i}>{headers.slice(0, 6).map((h) => <TableCell key={h} className="text-xs">{String(r[h] ?? "")}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
            <Button onClick={() => setStep(3)} disabled={!mapping.payment_date || !mapping.amount}>Continuar</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 font-medium"><Files className="h-4 w-4" /> Passo 3 — Envie os comprovantes</div>
          <Input type="file" multiple accept="image/*,application/pdf,.zip" disabled={extractingZip} onChange={(e) => e.target.files && handleReceipts(Array.from(e.target.files))} />
          {extractingZip && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Extraindo arquivos…</div>}
          <p className="text-xs text-muted-foreground">Envie arquivos soltos (PDF, JPG, PNG, WebP) ou um ZIP com toda a pasta.</p>
          {receiptFiles.length > 0 && (
            <div className="text-sm">Total: <strong>{receiptFiles.length}</strong> arquivos ({(receiptFiles.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} MB)</div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
            <Button onClick={runCross} disabled={crossing}>
              {crossing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Cruzando…</> : receiptFiles.length ? "Cruzar dados" : "Continuar sem comprovantes"}
            </Button>
          </div>
        </Card>
      )}

      {step >= 5 && report === null && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">Passo 5 — Revisão</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Identificados: {identified.length}</Badge>
              <Badge variant="secondary">Parciais: {partial.length}</Badge>
              <Badge variant="secondary">Sem comprovante: {noReceipt.length}</Badge>
              <Badge variant="secondary">Sem lançamento: {unusedFiles.length}</Badge>
              <Badge variant="secondary">Duplicidades: {duplicates.length}</Badge>
              <Badge variant="destructive">Erros: {withErrors.length}</Badge>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Perfil de destino</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
                <SelectContent>
                  {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs defaultValue="ok">
            <TabsList className="flex-wrap">
              <TabsTrigger value="ok">Identificados ({identified.length})</TabsTrigger>
              <TabsTrigger value="partial">Parciais ({partial.length})</TabsTrigger>
              <TabsTrigger value="noreceipt">Sem comprovante ({noReceipt.length})</TabsTrigger>
              <TabsTrigger value="unused">Sem lançamento ({unusedFiles.length})</TabsTrigger>
              <TabsTrigger value="dup">Duplicidades ({duplicates.length})</TabsTrigger>
              <TabsTrigger value="err">Erros ({withErrors.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="ok"><MatchTable rows={identified} /></TabsContent>
            <TabsContent value="partial"><MatchTable rows={partial} /></TabsContent>
            <TabsContent value="noreceipt"><MatchTable rows={noReceipt} /></TabsContent>
            <TabsContent value="dup"><MatchTable rows={duplicates} /></TabsContent>
            <TabsContent value="unused">
              <ul className="text-sm divide-y">
                {unusedFiles.map((f, i) => (
                  <li key={i} className="py-2 flex justify-between"><span>{f.name}</span><span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span></li>
                ))}
                {unusedFiles.length === 0 && <li className="py-2 text-xs text-muted-foreground">Nenhum</li>}
              </ul>
            </TabsContent>
            <TabsContent value="err">
              <ul className="text-sm divide-y">
                {withErrors.map((p) => (
                  <li key={p.idx} className="py-2 flex justify-between"><span>Linha {p.idx + 2}</span><span className="text-xs text-destructive">{p.errors.join(", ")}</span></li>
                ))}
                {withErrors.length === 0 && <li className="py-2 text-xs text-muted-foreground">Nenhum</li>}
              </ul>
            </TabsContent>
          </Tabs>

          {importing && (
            <div className="space-y-1">
              <Progress value={progress} />
              <div className="text-xs text-muted-foreground">{progressLabel} · {progress}%</div>
            </div>
          )}

          <div className="rounded-md border p-3 bg-muted/30 text-xs space-y-1">
            <div className="font-medium">Resumo antes de importar</div>
            <div>Total na planilha: {parsed.length}</div>
            <div>Serão importados: {parsed.length - withErrors.length - duplicates.length}</div>
            <div>Com comprovante: {identified.length + partial.length}</div>
            <div>Sem comprovante: {noReceipt.length}</div>
            <div>Duplicidades ignoradas: {duplicates.length}</div>
            <div>Erros de validação: {withErrors.length}</div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)} disabled={importing}>Voltar</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportPendingCSV} disabled={importing}><Download className="h-4 w-4 mr-2" /> Baixar pendências</Button>
              <Button onClick={runImport} disabled={importing || !profileId || parsed.length - withErrors.length - duplicates.length === 0}>
                {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importando…</> : <><UploadCloud className="h-4 w-4 mr-2" /> Importar {parsed.length - withErrors.length - duplicates.length} lançamentos</>}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {report && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-primary" /> Relatório de importação</div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Stat label="Linhas na planilha" value={report.totalRows} />
            <Stat label="Importados" value={report.imported} />
            <Stat label="Com comprovante" value={report.withReceipt} />
            <Stat label="Sem comprovante" value={report.withoutReceipt} />
            <Stat label="Comprovantes não usados" value={report.unusedFiles} />
            <Stat label="Duplicidades ignoradas" value={report.duplicates} />
            <Stat label="Erros de validação" value={report.validationErrors} tone={report.validationErrors ? "warn" : undefined} />
            <Stat label="Erros" value={report.errors} tone={report.errors ? "warn" : undefined} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={exportPendingCSV}><Download className="h-4 w-4 mr-2" /> Baixar pendências CSV</Button>
            <Button variant="outline" onClick={() => { setStep(1); setFile(null); setRows([]); setHeaders([]); setParsed([]); setReceiptFiles([]); setUnusedFiles([]); setReport(null); }}>
              Nova importação
            </Button>
          </div>
        </Card>
      )}

      {file && step < 5 && <p className="text-xs text-muted-foreground">Planilha: {file.name}</p>}
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MatchTable({ rows }: { rows: ParsedRow[] }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground py-4">Nenhum registro</p>;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead><TableHead>Valor</TableHead><TableHead>Destinatário</TableHead>
            <TableHead>Banco</TableHead><TableHead>Categoria</TableHead><TableHead>Comprovante</TableHead><TableHead>Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 100).map((p) => (
            <TableRow key={p.idx}>
              <TableCell className="text-xs">{p.payment_date ?? "—"}</TableCell>
              <TableCell className="text-xs">{p.amount?.toFixed(2) ?? "—"}</TableCell>
              <TableCell className="text-xs">{p.recipient_name ?? "—"}</TableCell>
              <TableCell className="text-xs">{p.bank_name ?? "—"}</TableCell>
              <TableCell className="text-xs">{p.category ?? "—"}</TableCell>
              <TableCell className="text-xs">{p.matchedFile?.name ?? "—"}</TableCell>
              <TableCell className="text-xs">{p.matchScore ? <Badge variant={p.matchScore >= 80 ? "default" : "secondary"}>{p.matchScore}</Badge> : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > 100 && <p className="p-2 text-xs text-muted-foreground">Mostrando primeiras 100 de {rows.length}.</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "warn" ? "border-destructive/40" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {tone === "warn" && value > 0 && <AlertTriangle className="h-3 w-3 text-destructive mt-1" />}
    </div>
  );
}