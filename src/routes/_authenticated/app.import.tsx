import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  History,
  Building2,
  Beaker,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { reanalyzeBatchProperties } from "@/lib/import.functions";
import {
  readSpreadsheet,
  detectHeader,
  normalizeAll,
  type HeaderDetection,
  type NormalizedRow,
} from "@/lib/smart-import";
import { dateBR } from "@/lib/format";
import { ImportReview } from "@/components/import-review";
import { ImportZipPanel } from "@/components/import-zip";
import { ImportMatches } from "@/components/import-matches";
import { ImportConference } from "@/components/import-conference";
import { classifyRowKind } from "@/lib/import-kind";

export const Route = createFileRoute("/_authenticated/app/import")({
  head: () => ({ meta: [{ title: "Importação Inteligente — Meu Cofre" }] }),
  component: ImportPage,
});

type Phase =
  | "idle"
  | "received"
  | "header"
  | "reading"
  | "normalizing"
  | "saving"
  | "done"
  | "error";

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  received: "Arquivo recebido",
  header: "Cabeçalho identificado",
  reading: "Linhas lidas",
  normalizing: "Dados normalizados",
  saving: "Importação salva",
  done: "Concluído",
  error: "Falha na importação",
};

const PHASES: Exclude<Phase, "idle" | "done" | "error">[] = [
  "received",
  "header",
  "reading",
  "normalizing",
  "saving",
];

const ACCEPT = ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function ImportPage() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [detection, setDetection] = useState<HeaderDetection | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [savedRows, setSavedRows] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(null);
  const [conferenceOpen, setConferenceOpen] = useState(false);
  // "general" = conta geral (sem perfil dedicado). Caso contrário é um profile_id.
  const [scopeChoice, setScopeChoice] = useState<string>("general");
  const fileInput = useRef<HTMLInputElement>(null);

  const profilesQ = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_profiles")
        .select("id, name")
        .eq("archived", false)
        .order("name");
      return data ?? [];
    },
  });
  const reanalyzeFn = useServerFn(reanalyzeBatchProperties);

  // Restore any in-progress batch on mount (survives page refresh).
  useEffect(() => {
    const stored = localStorage.getItem("mc.import.currentBatch");
    if (!stored) return;
    (async () => {
      const { data } = await supabase
        .from("import_batches")
        .select("*")
        .eq("id", stored)
        .maybeSingle();
      if (!data) {
        localStorage.removeItem("mc.import.currentBatch");
        return;
      }
      setBatchId(data.id);
      setPhase((data.phase as Phase) ?? "received");
      setProgress(data.progress_percent ?? 0);
      setTotalRows(data.total_rows ?? 0);
      setSavedRows(data.saved_rows ?? 0);
      if (data.header_columns && data.header_row !== null) {
        setDetection({
          headerRow: data.header_row ?? 0,
          header: (data.header_columns as string[]) ?? [],
          mapping: (data.column_mapping as any) ?? {},
          confidence: 0,
        });
      }
    })();
  }, []);

  const history = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_batches")
        .select("id, file_name, total_rows, saved_rows, phase, status, created_at, header_row, separator")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const updateBatch = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      await supabase.from("import_batches").update(patch as any).eq("id", id);
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg(null);
      setDetection(null);
      setTotalRows(0);
      setSavedRows(0);
      try {
        const { data: u } = await supabase.auth.getUser();
        const userId = u.user?.id;
        if (!userId) throw new Error("Sessão expirada");

        // Phase 1 — file received
        setPhase("received");
        setProgress(5);
        const { data: batch, error: bErr } = await supabase
          .from("import_batches")
          .insert({
            user_id: userId,
            file_name: file.name,
            file_size: file.size,
            file_mime: file.type || null,
            phase: "received",
            progress_percent: 5,
            status: "running",
            scope_kind: scopeChoice === "general" ? "general" : "profile",
            profile_id: scopeChoice === "general" ? null : scopeChoice,
          })
          .select("id")
          .single();
        if (bErr || !batch) throw new Error(bErr?.message ?? "Não foi possível iniciar");
        setBatchId(batch.id);
        localStorage.setItem("mc.import.currentBatch", batch.id);

        // Phase 2 — parse + detect header
        setPhase("header");
        setProgress(15);
        const parsed = await readSpreadsheet(file);
        const det = detectHeader(parsed.matrix);
        setDetection(det);
        await updateBatch(batch.id, {
          phase: "header",
          progress_percent: 20,
          separator: parsed.separator ?? null,
          header_row: det.headerRow,
          header_columns: det.header,
          column_mapping: det.mapping,
        });

        // Phase 3 — read rows
        setPhase("reading");
        setProgress(35);
        const dataRows = parsed.matrix.length - (det.headerRow + 1);
        setTotalRows(Math.max(0, dataRows));
        await updateBatch(batch.id, {
          phase: "reading",
          progress_percent: 40,
          total_rows: Math.max(0, dataRows),
          parsed_rows: Math.max(0, dataRows),
        });

        // Phase 4 — normalize
        setPhase("normalizing");
        setProgress(55);
        const normalized: NormalizedRow[] = normalizeAll(parsed.matrix, det);
        await updateBatch(batch.id, {
          phase: "normalizing",
          progress_percent: 65,
          normalized_rows: normalized.length,
        });

        // Phase 5 — persist rows in chunks
        setPhase("saving");
        setProgress(70);
        const CHUNK = 200;
        let saved = 0;
        for (let i = 0; i < normalized.length; i += CHUNK) {
          const slice = normalized.slice(i, i + CHUNK);
          const payload = slice.map((r) => ({
            user_id: userId,
            batch_id: batch.id,
            row_number: r.row_number,
            raw_data: r.raw,
            normalized_data: r.normalized,
            amount: r.normalized.amount ?? r.normalized.amount_brl ?? null,
            currency: r.normalized.currency ?? null,
            transaction_date: r.normalized.date ?? null,
            category: r.normalized.category ?? null,
            category_original: r.normalized.category ?? r.parsed_notes.original_category ?? null,
            account: r.normalized.account ?? null,
            description: r.normalized.description ?? null,
            notes: r.normalized.notes ?? null,
            // Fields the receipt matcher needs to cross-check spreadsheet ↔ file.
            payee: r.normalized.counterparty ?? r.normalized.description ?? null,
            file_name: r.parsed_notes.file_name ?? null,
            folder_path: r.parsed_notes.folder_path ?? null,
            source_id: r.parsed_notes.source_id ?? null,
            invoice_number: r.parsed_notes.invoice_number ?? null,
            page_number: r.parsed_notes.page_number ?? null,
            bank: r.parsed_notes.bank ?? null,
            holder: r.parsed_notes.holder ?? null,
            payment_method: r.parsed_notes.payment_method ?? null,
            card_last4: (r.parsed_notes.card ?? "").replace(/\D/g, "").slice(-4) || null,
            parsed_notes: r.parsed_notes,
            status: r.status,
            error_message: r.error ?? null,
            kind: classifyRowKind(
              r.normalized.description ?? r.normalized.notes,
              r.parsed_notes.payment_method,
              r.normalized.category,
            ),
            transaction_type: (function() {
              const raw = r.raw;
              // Procure por uma coluna que contenha "CONTA" ou "ORIGEM" e tenha valores "DESPESAS" ou "INVESTIMENTOS"
              for (const val of Object.values(raw)) {
                const s = String(val || "").toUpperCase();
                if (s === "DESPESAS") return "DESPESA";
                if (s === "INVESTIMENTOS") return "INVESTIMENTO";
              }
              return null;
            })(),
          }));
          const { error: rowErr } = await supabase.from("import_rows").insert(payload as any);
          if (rowErr) throw new Error(`Linha ${slice[0].row_number}: ${rowErr.message}`);
          saved += slice.length;
          setSavedRows(saved);
          const pct = 70 + Math.round((saved / Math.max(normalized.length, 1)) * 28);
          setProgress(pct);
          await updateBatch(batch.id, {
            saved_rows: saved,
            progress_percent: pct,
          });
        }

        // Done
        setPhase("done");
        setProgress(100);
        await updateBatch(batch.id, {
          phase: "saving",
          progress_percent: 100,
          status: "completed",
          imported_count: saved,
          finished_at: new Date().toISOString(),
        });
        localStorage.removeItem("mc.import.currentBatch");
        toast.success(`${saved} linhas importadas de ${file.name}`);
        qc.invalidateQueries({ queryKey: ["import-batches"] });
        setReviewBatchId(batch.id);
      } catch (e: any) {
        setPhase("error");
        setErrorMsg(e.message ?? String(e));
        toast.error(e.message ?? "Falha na importação");
        if (batchId) {
          await updateBatch(batchId, {
            status: "failed",
            phase: "error",
          });
        }
      }
    },
    [qc, updateBatch, batchId, scopeChoice],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const activePhaseIndex = useMemo(() => {
    if (phase === "idle") return -1;
    if (phase === "done") return PHASES.length;
    if (phase === "error") return -1;
    return PHASES.indexOf(phase as any);
  }, [phase]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[280px]">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Importação Inteligente
          </h1>
          <p className="text-sm text-muted-foreground">
            Envie uma planilha (CSV, XLS ou XLSX). O sistema detecta o cabeçalho
            automaticamente, mesmo quando existem títulos ou linhas em branco no início.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="hidden sm:inline-flex gap-1">
            <Sparkles className="h-3 w-3" /> Parte 1 · Leitura Inteligente
          </Badge>
        </div>
      </header>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> Escopo desta importação
            </Label>
            <Select value={scopeChoice} onValueChange={setScopeChoice}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Selecione o perfil ou Conta geral" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Conta geral (sem perfil dedicado)</SelectItem>
                {(profilesQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A IA só sugerirá imóveis vinculados ao perfil escolhido. Escolha "Conta geral" para permitir qualquer imóvel do seu cadastro.
            </p>
          </div>
        </div>
      </Card>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
        }`}
      >
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground">
          <UploadCloud className="h-7 w-7" />
        </div>
        <p className="mt-4 text-base font-semibold text-foreground">
          Arraste sua planilha ou clique para selecionar
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          CSV, XLS ou XLSX · o cabeçalho pode estar em qualquer uma das primeiras 25 linhas
        </p>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {phase !== "idle" && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Progresso da importação
            </div>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="mb-4" />

          <ol className="grid gap-2 sm:grid-cols-5">
            {PHASES.map((p, idx) => {
              const done = idx < activePhaseIndex || phase === "done";
              const active = idx === activePhaseIndex && phase !== "done";
              return (
                <li
                  key={p}
                  className={`rounded-xl border p-3 text-center text-xs ${
                    done
                      ? "border-success/40 bg-success/5 text-success"
                      : active
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground"
                  }`}
                >
                  <div className="mb-1 flex justify-center">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="inline-block h-4 w-4 rounded-full border" />
                    )}
                  </div>
                  {PHASE_LABEL[p]}
                </li>
              );
            })}
          </ol>

          {detection && (
            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-xs">
              <p className="font-medium text-foreground">
                Cabeçalho na linha {detection.headerRow + 1} · {detection.header.filter(Boolean).length} colunas
              </p>
              <p className="mt-1 text-muted-foreground">
                Mapeadas:{" "}
                {Object.keys(detection.mapping).length > 0
                  ? Object.keys(detection.mapping).join(", ")
                  : "nenhuma"}
              </p>
            </div>
          )}

          {phase === "reading" || phase === "normalizing" || phase === "saving" || phase === "done" ? (
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
              <Metric label="Linhas lidas" value={totalRows} />
              <Metric label="Normalizadas" value={totalRows} />
              <Metric label="Salvas" value={savedRows} />
              <Metric
                label="Pendentes"
                value={Math.max(totalRows - savedRows, 0)}
              />
            </div>
          ) : null}

          {phase === "error" && errorMsg && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </Card>
      )}

      {(reviewBatchId ?? batchId) && (
        <ImportReview batchId={(reviewBatchId ?? batchId) as string} />
      )}

      {(reviewBatchId ?? batchId) && (
        <ImportZipPanel batchId={(reviewBatchId ?? batchId) as string} />
      )}

      {(reviewBatchId ?? batchId) && (
        <ImportMatches batchId={(reviewBatchId ?? batchId) as string} />
      )}

      {(reviewBatchId ?? batchId) && (
        <Card className="flex items-center gap-3 p-4">
          <div className="flex-1">
            <p className="text-sm font-semibold">Importação concluída — iniciar conferência</p>
            <p className="text-xs text-muted-foreground">
              Revise linha por linha, aprove, rejeite ou envie para "Ver depois". Decisões ficam salvas.
            </p>
          </div>
          <Button onClick={() => setConferenceOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" /> Iniciar conferência
          </Button>
        </Card>
      )}

      {conferenceOpen && (reviewBatchId ?? batchId) && (
        <ImportConference
          batchId={(reviewBatchId ?? batchId) as string}
          onClose={() => setConferenceOpen(false)}
        />
      )}

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-primary" />
          Histórico de importações
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 text-xs"
            onClick={() => qc.invalidateQueries({ queryKey: ["import-batches"] })}
          >
            <RefreshCw className="h-3 w-3" /> Atualizar
          </Button>
        </div>
        {history.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (history.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma importação registrada ainda.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {(history.data ?? []).map((b) => (
              <div
                key={b.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3"
              >
                <button
                  type="button"
                  onClick={() => setReviewBatchId(b.id)}
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {b.file_name ?? "planilha"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {dateBR(b.created_at)} · {b.saved_rows ?? 0}/{b.total_rows ?? 0} linhas
                    {b.header_row !== null ? ` · cabeçalho na linha ${(b.header_row ?? 0) + 1}` : ""}
                  </p>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 text-xs"
                  onClick={async () => {
                    try {
                      const res = await reanalyzeFn({ data: { batchId: b.id } });
                      toast.success(`${res.suggested}/${res.scanned} lançamentos com sugestão de imóvel`);
                    } catch (e: any) {
                      toast.error(e?.message ?? "Falha ao reanalisar");
                    }
                  }}
                  title="Reaplica as regras aprendidas sobre imóveis a este lote"
                >
                  <Sparkles className="h-3 w-3" /> Reanalisar imóveis
                </Button>
                <Badge
                  variant={
                    b.status === "completed"
                      ? "default"
                      : b.status === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {b.status ?? "—"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}