// ---------------------------------------------------------------------------
// Parte 5 — Tela final de conferência
//
// Split layout (viewer + editor + actions) for row-by-row review with filters,
// pending queue and persistent Approve / Reject / Ver depois decisions.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Undo2,
  Paperclip,
  Star,
  ExternalLink,
  FileWarning,
  Sparkles,
  ChevronDown,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import {
  approveImportRow,
  classifyImportRow,
  setImportRowStatus,
} from "@/lib/import.functions";
import {
  attachFileManually,
  detachRowFile,
  setPrimaryRowFile,
} from "@/lib/receipt-matcher";
import { currencyBRL } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types + constants
// ---------------------------------------------------------------------------

type ReviewStatus = "pending" | "approved" | "rejected" | "ver_depois";

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  ver_depois: "Ver depois",
};

const STATUS_COLOR: Record<ReviewStatus, string> = {
  pending: "bg-muted text-foreground",
  approved: "bg-emerald-600 text-white",
  rejected: "bg-destructive text-destructive-foreground",
  ver_depois: "bg-amber-500 text-white",
};

const FIELDS: Array<{ key: string; label: string; type?: "number" | "textarea" | "select"; options?: string[] }> = [
  { key: "transaction_date", label: "Data" },
  { key: "amount", label: "Valor", type: "number" },
  { key: "currency", label: "Moeda" },
  {
    key: "transaction_type",
    label: "Tipo",
    type: "select",
    options: ["DESPESA", "INVESTIMENTO"],
  },
  { key: "category", label: "Categoria" },
  { key: "subcategory", label: "Subcategoria" },
  { key: "description", label: "Descrição" },
  { key: "payee", label: "Favorecido" },
  { key: "bank", label: "Banco" },
  { key: "card", label: "Cartão" },
  { key: "card_last4", label: "Final do cartão" },
  { key: "payment_method", label: "Forma de pagamento" },
  { key: "holder", label: "Titular / pagador" },
  { key: "account", label: "Conta" },
  { key: "notes", label: "Observações", type: "textarea" },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ImportConference({
  batchId,
  onClose,
}: {
  batchId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const approveFn = useServerFn(approveImportRow);
  const statusFn = useServerFn(setImportRowStatus);
  const classifyFn = useServerFn(classifyImportRow);

  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus | "no_receipt" | "low_conf" | "duplicate">(
    "pending",
  );
  const [typeFilter, setTypeFilter] = useState<"all" | "DESPESA" | "INVESTIMENTO">("all");
  const [textFilter, setTextFilter] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  // Editor state lives in the parent so the fixed footer can act on it.
  const [values, setValues] = useState<Record<string, any>>({});
  const [reason, setReason] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [showAllFilters, setShowAllFilters] = useState(false);

  // ---- data ----

  const rowsQ = useQuery({
    queryKey: ["conf-rows", batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_rows")
        .select("*")
        .eq("batch_id", batchId)
        .order("row_number")
        .limit(5000);
      return data ?? [];
    },
  });

  const linksQ = useQuery({
    queryKey: ["conf-links", batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_row_files")
        .select("*")
        .eq("batch_id", batchId)
        .order("score", { ascending: false })
        .limit(20000);
      return data ?? [];
    },
  });

  const filesQ = useQuery({
    queryKey: ["conf-files", batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_files")
        .select("id, file_name, original_path, extension, mime_type, storage_path, page_count")
        .eq("batch_id", batchId)
        .order("original_path")
        .limit(20000);
      return data ?? [];
    },
  });

  const linksByRow = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const l of linksQ.data ?? []) {
      if (!m.has(l.row_id)) m.set(l.row_id, []);
      m.get(l.row_id)!.push(l);
    }
    return m;
  }, [linksQ.data]);

  const fileById = useMemo(() => {
    const m = new Map<string, any>();
    for (const f of filesQ.data ?? []) m.set(f.id, f);
    return m;
  }, [filesQ.data]);

  // Duplicate detection: same amount + date + payee
  const duplicateIds = useMemo(() => {
    const buckets = new Map<string, string[]>();
    for (const r of rowsQ.data ?? []) {
      if (!r.amount || !r.transaction_date) continue;
      const k = `${r.amount}|${r.transaction_date}|${(r.payee ?? "").toLowerCase().trim()}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r.id);
    }
    const dup = new Set<string>();
    for (const ids of buckets.values()) {
      if (ids.length > 1) ids.forEach((id) => dup.add(id));
    }
    return dup;
  }, [rowsQ.data]);

  const filteredRows = useMemo(() => {
    const list = rowsQ.data ?? [];
    const q = textFilter.trim().toLowerCase();
    return list.filter((r: any) => {
      const status = (r.review_status ?? "pending") as ReviewStatus;
      const links = linksByRow.get(r.id) ?? [];
      const primary = links.find((l) => l.is_primary) ?? links[0];
      const conf = primary?.confidence as string | undefined;
      // status filter
      if (statusFilter === "no_receipt" && links.length > 0) return false;
      if (statusFilter === "low_conf" && conf !== "low" && conf !== "review") return false;
      if (statusFilter === "duplicate" && !duplicateIds.has(r.id)) return false;
      if (
        statusFilter !== "all" &&
        statusFilter !== "no_receipt" &&
        statusFilter !== "low_conf" &&
        statusFilter !== "duplicate" &&
        status !== statusFilter
      )
        return false;
      // type
      if (typeFilter !== "all" && r.transaction_type !== typeFilter) return false;
      // text
      if (q) {
        const bag = `${r.description ?? ""} ${r.payee ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!bag.includes(q)) return false;
      }
      if (bankFilter && !(r.bank ?? "").toLowerCase().includes(bankFilter.toLowerCase())) return false;
      if (categoryFilter && !(r.category ?? "").toLowerCase().includes(categoryFilter.toLowerCase())) return false;
      if (cardFilter && !(r.card ?? "").toLowerCase().includes(cardFilter.toLowerCase())) return false;
      if (dateFrom && r.transaction_date && r.transaction_date < dateFrom) return false;
      if (dateTo && r.transaction_date && r.transaction_date > dateTo) return false;
      const amt = typeof r.amount === "number" ? Math.abs(r.amount) : NaN;
      if (minAmount && !(Number.isFinite(amt) && amt >= parseFloat(minAmount))) return false;
      if (maxAmount && !(Number.isFinite(amt) && amt <= parseFloat(maxAmount))) return false;
      return true;
    });
  }, [
    rowsQ.data,
    linksByRow,
    duplicateIds,
    statusFilter,
    typeFilter,
    textFilter,
    bankFilter,
    categoryFilter,
    cardFilter,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
  ]);

  useEffect(() => {
    if (activeIdx >= filteredRows.length) setActiveIdx(0);
  }, [filteredRows.length, activeIdx]);

  const activeRow = filteredRows[activeIdx];

  // Re-hydrate editor state whenever the active row changes.
  useEffect(() => {
    if (activeRow) {
      setValues(hydrateValues(activeRow));
      setReason("");
    } else {
      setValues({});
      setReason("");
    }
  }, [activeRow?.id]);

  function collectOverrides(): Record<string, unknown> {
    const overrides: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const v = values[f.key];
      if (v === "" || v === undefined || v === null) continue;
      if (f.type === "number") {
        const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
        if (Number.isFinite(n)) overrides[f.key] = n;
      } else {
        overrides[f.key] = String(v);
      }
    }
    return overrides;
  }

  const counts = useMemo(() => {
    const list = rowsQ.data ?? [];
    let pending = 0,
      approved = 0,
      rejected = 0,
      ver = 0,
      no = 0,
      low = 0;
    for (const r of list) {
      const s = (r.review_status ?? "pending") as ReviewStatus;
      if (s === "approved") approved++;
      else if (s === "rejected") rejected++;
      else if (s === "ver_depois") ver++;
      else pending++;
      const links = linksByRow.get(r.id) ?? [];
      if (links.length === 0) no++;
      else if (links[0].confidence === "low" || links[0].confidence === "review") low++;
    }
    return {
      total: list.length,
      pending,
      approved,
      rejected,
      ver,
      no,
      low,
      dup: duplicateIds.size,
    };
  }, [rowsQ.data, linksByRow, duplicateIds]);

  // ---- actions ----

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["conf-rows", batchId] });
    qc.invalidateQueries({ queryKey: ["conf-links", batchId] });
  };

  async function goNext() {
    setActiveIdx((i) => Math.min(i + 1, Math.max(filteredRows.length - 1, 0)));
  }
  async function goPrev() {
    setActiveIdx((i) => Math.max(i - 1, 0));
  }

  const [savingAction, setSavingAction] = useState<null | "approve" | "reject" | "ver_depois" | "save" | "undo" | "reclassify">(
    null,
  );

  async function handleApprove(overrides: Record<string, unknown>) {
    if (!activeRow) return;
    setSavingAction("approve");
    try {
      await approveFn({ data: { rowId: activeRow.id, overrides: overrides as any } });
      toast.success("Aprovado");
      invalidate();
      goNext();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao aprovar");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleReject(reason: string, overrides: Record<string, unknown>) {
    if (!activeRow) return;
    setSavingAction("reject");
    try {
      await statusFn({
        data: { rowId: activeRow.id, status: "rejected", reason, overrides },
      });
      toast.success("Rejeitado");
      invalidate();
      goNext();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao rejeitar");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleVerDepois(overrides: Record<string, unknown>) {
    if (!activeRow) return;
    setSavingAction("ver_depois");
    try {
      await statusFn({
        data: { rowId: activeRow.id, status: "ver_depois", overrides },
      });
      toast.success("Movido para fila de pendências");
      invalidate();
      goNext();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao adiar");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleSaveOnly(overrides: Record<string, unknown>) {
    if (!activeRow) return;
    setSavingAction("save");
    try {
      await statusFn({
        data: { rowId: activeRow.id, status: "pending", overrides },
      });
      toast.success("Alterações salvas");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleUndo() {
    if (!activeRow) return;
    setSavingAction("undo");
    try {
      await statusFn({
        data: { rowId: activeRow.id, status: "pending" },
      });
      toast.success("Decisão desfeita");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao desfazer");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleReclassify() {
    if (!activeRow) return;
    setSavingAction("reclassify");
    try {
      await classifyFn({ data: { rowId: activeRow.id } });
      toast.success("Reclassificado pela IA");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reclassificar");
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[90vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Sticky header */}
        <div className="shrink-0 border-b border-border bg-background px-4 py-3">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base">
              Conferência de comprovantes
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {counts.total} linhas · {counts.pending} pendentes · {counts.approved} aprovadas ·{" "}
              {counts.rejected} rejeitadas · {counts.ver} ver depois · {counts.no} sem comprovante ·{" "}
              {counts.low} baixa confiança · {counts.dup} possíveis duplicidades
            </p>
          </DialogHeader>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Button size="sm" variant="outline" onClick={goPrev} disabled={activeIdx <= 0}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="tabular-nums">
              Linha {filteredRows.length === 0 ? 0 : activeIdx + 1} de {filteredRows.length}
            </span>
            <Button size="sm" variant="outline" onClick={goNext} disabled={activeIdx >= filteredRows.length - 1}>
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-8 w-[190px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({counts.total})</SelectItem>
                <SelectItem value="pending">Pendentes ({counts.pending})</SelectItem>
                <SelectItem value="approved">Aprovados ({counts.approved})</SelectItem>
                <SelectItem value="rejected">Rejeitados ({counts.rejected})</SelectItem>
                <SelectItem value="ver_depois">Ver depois ({counts.ver})</SelectItem>
                <SelectItem value="no_receipt">Sem comprovante ({counts.no})</SelectItem>
                <SelectItem value="low_conf">Baixa confiança ({counts.low})</SelectItem>
                <SelectItem value="duplicate">Duplicidades ({counts.dup})</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="DESPESA">Despesa</SelectItem>
                <SelectItem value="INVESTIMENTO">Investimento</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={handleReclassify}
              disabled={savingAction !== null || !activeRow}
            >
              <Sparkles className="mr-1 h-3 w-3" /> Reanalisar com IA
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAllFilters((s) => !s)}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showAllFilters ? "rotate-180" : ""}`} />
              <span className="ml-1">Mais filtros</span>
            </Button>
          </div>

          {showAllFilters && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 w-56 pl-7 text-xs"
                  placeholder="Buscar descrição / favorecido"
                  value={textFilter}
                  onChange={(e) => setTextFilter(e.target.value)}
                />
              </div>
              <Input className="h-8 w-28 text-xs" placeholder="Banco" value={bankFilter} onChange={(e) => setBankFilter(e.target.value)} />
              <Input className="h-8 w-32 text-xs" placeholder="Categoria" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} />
              <Input className="h-8 w-28 text-xs" placeholder="Cartão" value={cardFilter} onChange={(e) => setCardFilter(e.target.value)} />
              <Input className="h-8 w-36 text-xs" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input className="h-8 w-36 text-xs" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <Input className="h-8 w-24 text-xs" placeholder="Min R$" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
              <Input className="h-8 w-24 text-xs" placeholder="Max R$" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
            </div>
          )}
        </div>

        {/* Single scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
          {activeRow ? (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <ReceiptViewer
                row={activeRow}
                links={(linksByRow.get(activeRow.id) ?? []).slice().sort((a, b) => b.score - a.score)}
                files={filesQ.data ?? []}
                fileById={fileById}
                onChanged={invalidate}
              />
              <RowEditor
                row={activeRow}
                links={linksByRow.get(activeRow.id) ?? []}
                isDuplicate={duplicateIds.has(activeRow.id)}
                values={values}
                setValues={setValues}
                reason={reason}
                setReason={setReason}
                showRaw={showRaw}
                setShowRaw={setShowRaw}
              />
            </div>
          ) : (
            <div className="grid h-64 place-items-center text-sm text-muted-foreground">
              Nenhuma linha corresponde aos filtros.
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-4 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={handleUndo}
            disabled={savingAction !== null || !activeRow}
          >
            <Undo2 className="mr-1 h-3 w-3" /> Desfazer
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => activeRow && handleSaveOnly(collectOverrides())}
            disabled={savingAction !== null || !activeRow}
          >
            Salvar sem aprovar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => activeRow && handleReject(reason, collectOverrides())}
            disabled={savingAction !== null || !activeRow}
          >
            <XCircle className="mr-1 h-3 w-3" /> Rejeitar
          </Button>
          <Button
            size="sm"
            className="bg-amber-500 text-white hover:bg-amber-500/90"
            onClick={() => activeRow && handleVerDepois(collectOverrides())}
            disabled={savingAction !== null || !activeRow}
          >
            <Clock className="mr-1 h-3 w-3" /> Ver depois
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            onClick={() => activeRow && handleApprove(collectOverrides())}
            disabled={savingAction !== null || !activeRow}
          >
            <CheckCircle2 className="mr-1 h-3 w-3" /> Aprovar e continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Row editor + actions
// ---------------------------------------------------------------------------

function RowEditor({
  row,
  links,
  isDuplicate,
  values,
  setValues,
  reason,
  setReason,
  showRaw,
  setShowRaw,
}: {
  row: any;
  links: any[];
  isDuplicate: boolean;
  values: Record<string, any>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  reason: string;
  setReason: React.Dispatch<React.SetStateAction<string>>;
  showRaw: boolean;
  setShowRaw: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const meta = (row.ai_meta ?? {}) as Record<string, any>;
  const primary = links.find((l) => l.is_primary) ?? links[0];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={`text-[10px] ${STATUS_COLOR[(row.review_status ?? "pending") as ReviewStatus]}`}>
          {STATUS_LABEL[(row.review_status ?? "pending") as ReviewStatus]}
        </Badge>
        {isDuplicate && (
          <Badge variant="destructive" className="text-[10px]">
            possível duplicidade
          </Badge>
        )}
        {primary && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            comprovante · score {primary.score} · {primary.confidence}
          </span>
        )}
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-2">
        <p><b>Linha:</b> #{row.row_number}</p>
        <p className="truncate"><b>ID:</b> <span className="font-mono">{row.id}</span></p>
      </div>

        {FIELDS.map((f) => {
          const m = meta[f.key] ?? {};
          const conf = typeof m.confidence === "number" ? Math.round(m.confidence * 100) : null;
          const original = m.original ?? row.raw_data?.[f.key] ?? "";
          const v = values[f.key] ?? "";
          return (
            <div key={f.key} className="rounded-md border border-border p-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-[11px] font-semibold">{f.label}</Label>
                {conf !== null && (
                  <span
                    className={`text-[10px] ${
                      conf >= 80 ? "text-emerald-600" : conf >= 50 ? "text-amber-600" : "text-destructive"
                    }`}
                  >
                    confiança {conf}%
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Original: <span className="font-mono">{String(original || "—")}</span>
              </p>
              {f.type === "textarea" ? (
                <Textarea
                  rows={2}
                  className="mt-1 text-xs"
                  value={v}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              ) : f.type === "select" ? (
                <Select value={String(v || "")} onValueChange={(nv) => setValues((s) => ({ ...s, [f.key]: nv }))}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="mt-1 h-8 text-xs"
                  value={v}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              )}
              {m.rationale && (
                <p className="mt-1 text-[10px] italic text-muted-foreground">{m.rationale}</p>
              )}
            </div>
          );
        })}

      <div className="rounded-md border border-border p-2">
        <Label className="text-[11px] font-semibold">Motivo (para rejeição / anotação)</Label>
        <Textarea
          rows={2}
          className="mt-1 text-xs"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: comprovante ilegível, valor divergente…"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowRaw((s) => !s)}
        className="self-start text-[11px] text-primary underline"
      >
        {showRaw ? "Ocultar" : "Ver"} dados originais preservados
      </button>
      {showRaw && (
        <pre className="rounded-md border border-border bg-muted/40 p-2 text-[10px] whitespace-pre-wrap break-all">
          {JSON.stringify(row.raw_data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function hydrateValues(row: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of FIELDS) out[f.key] = row[f.key] ?? "";
  return out;
}

// ---------------------------------------------------------------------------
// Receipt viewer (PDF/image with zoom, rotation, pages, fullscreen, swap)
// ---------------------------------------------------------------------------

function ReceiptViewer({
  row,
  links,
  files,
  fileById,
  onChanged,
}: {
  row: any;
  links: any[];
  files: any[];
  fileById: Map<string, any>;
  onChanged: () => void;
}) {
  const primary = links.find((l) => l.is_primary) ?? links[0];
  const primaryFile = primary ? fileById.get(primary.file_id) : null;
  const [page, setPage] = useState<number>(primary?.page_number ?? 1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    setPage(primary?.page_number ?? 1);
    setZoom(1);
    setRotation(0);
  }, [row.id, primary?.id]);

  useEffect(() => {
    let cancelled = false;
    async function fetchUrl() {
      if (!primaryFile?.storage_path) {
        setSignedUrl(null);
        return;
      }
      const { data } = await supabase.storage
        .from("receipts")
        .createSignedUrl(primaryFile.storage_path, 3600);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    }
    fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [primaryFile?.storage_path]);

  const isPdf = (primaryFile?.mime_type ?? "").includes("pdf") || (primaryFile?.extension ?? "").toLowerCase() === "pdf";
  const pageCount = primaryFile?.page_count ?? 1;

  async function markUnlocated() {
    if (!primary) return;
    await detachRowFile(primary.id);
    toast.success("Comprovante desvinculado");
    onChanged();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2 text-xs">
        <span className="truncate font-mono text-[11px]">
          {primaryFile?.original_path ?? primaryFile?.file_name ?? "sem comprovante"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {isPdf && pageCount > 1 && (
            <>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span>
                pág {page}/{pageCount}
              </span>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCw className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setFullscreen(true)} disabled={!signedUrl}>
            <Maximize2 className="h-3 w-3" />
          </Button>
          {signedUrl && (
            <a href={signedUrl} target="_blank" rel="noreferrer" className="inline-flex">
              <Button size="sm" variant="ghost" className="h-7">
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" className="h-7" onClick={() => setSwapOpen(true)}>
            <Paperclip className="mr-1 h-3 w-3" /> Trocar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={markUnlocated}
            disabled={!primary}
          >
            <FileWarning className="mr-1 h-3 w-3" /> Não localizado
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!primaryFile ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
            <div>
              <FileWarning className="mx-auto mb-2 h-8 w-8" />
              Nenhum comprovante vinculado a esta linha.
              <div className="mt-3">
                <Button size="sm" onClick={() => setSwapOpen(true)}>
                  <Paperclip className="mr-1 h-3 w-3" /> Associar manualmente
                </Button>
              </div>
            </div>
          </div>
        ) : !signedUrl ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div
            className="mx-auto origin-top overflow-visible"
            style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transition: "transform 120ms" }}
          >
            {isPdf ? (
              <PdfPage url={signedUrl} pageNumber={page} />
            ) : (
              <img
                src={signedUrl}
                alt={primaryFile.file_name}
                className="mx-auto max-w-[900px] rounded shadow"
                draggable={false}
              />
            )}
          </div>
        )}
      </div>

      {/* Candidatos */}
      {links.length > 0 && (
        <div className="max-h-40 overflow-auto border-t border-border p-2 text-xs">
          <p className="mb-1 font-semibold">Outros candidatos</p>
          <div className="grid gap-1">
            {links.map((l) => {
              const f = fileById.get(l.file_id);
              return (
                <div key={l.id} className="flex items-center gap-2 rounded border border-border/60 p-1">
                  {l.is_primary && <Star className="h-3 w-3 fill-amber-500 text-amber-500" />}
                  <span className="truncate font-mono text-[10px]">
                    {f?.original_path ?? f?.file_name}
                    {l.page_number ? ` · p.${l.page_number}` : ""}
                  </span>
                  <Badge variant="outline" className="ml-auto text-[9px]">
                    {l.score} · {l.confidence}
                  </Badge>
                  {!l.is_primary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6"
                      onClick={async () => {
                        await setPrimaryRowFile(row.id, l.id);
                        onChanged();
                      }}
                    >
                      <Star className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fullscreen */}
      {fullscreen && signedUrl && (
        <Dialog open onOpenChange={(o) => !o && setFullscreen(false)}>
          <DialogContent className="max-w-[95vw]">
            <DialogHeader>
              <DialogTitle>{primaryFile?.file_name}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[80vh] overflow-auto">
              {isPdf ? (
                <PdfPage url={signedUrl} pageNumber={page} large />
              ) : (
                <img src={signedUrl} alt="" className="mx-auto" />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {swapOpen && (
        <SwapReceiptDialog
          rowId={row.id}
          batchId={row.batch_id}
          links={links}
          files={files}
          onClose={() => setSwapOpen(false)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF single-page canvas renderer (supports arbitrary page number)
// ---------------------------------------------------------------------------

function PdfPage({ url, pageNumber, large = false }: { url: string; pageNumber: number; large?: boolean }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvas) return;
    let cancelled = false;
    let task: any;
    (async () => {
      try {
        setError(null);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        task = pdfjs.getDocument({ url });
        const doc = await task.promise;
        const p = Math.min(Math.max(pageNumber, 1), doc.numPages);
        const page = await doc.getPage(p);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const targetWidth = large ? 1100 : 720;
        const scale = Math.min(Math.max(targetWidth / base.width, 1.2), 3);
        const vp = page.getViewport({ scale });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${Math.min(targetWidth, Math.floor(vp.width))}px`;
        canvas.style.height = "auto";
        await page.render({ canvas, viewport: vp }).promise;
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
      task?.destroy?.().catch(() => undefined);
    };
  }, [canvas, url, pageNumber, large]);

  return (
    <div className="flex flex-col items-center">
      <canvas ref={setCanvas} className="rounded bg-white shadow" />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swap / manual attach dialog
// ---------------------------------------------------------------------------

function SwapReceiptDialog({
  rowId,
  batchId,
  links,
  files,
  onClose,
  onChanged,
}: {
  rowId: string;
  batchId: string;
  links: any[];
  files: any[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files.slice(0, 40);
    return files
      .filter((f) => `${f.file_name} ${f.original_path ?? ""}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [files, query]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trocar / associar comprovante</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            className="text-xs"
            placeholder="Buscar arquivo por nome ou caminho…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Input
            className="w-20 text-xs"
            placeholder="pág."
            value={page}
            onChange={(e) => setPage(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="mt-2 max-h-[50vh] overflow-auto rounded border border-border">
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              className="flex w-full items-center gap-2 border-b border-border/60 p-2 text-left text-xs hover:bg-muted/40"
              onClick={async () => {
                try {
                  await attachFileManually({
                    batchId,
                    rowId,
                    fileId: f.id,
                    pageNumber: page ? parseInt(page, 10) : null,
                    makePrimary: true,
                  });
                  toast.success("Comprovante associado");
                  onChanged();
                  onClose();
                } catch (e: any) {
                  toast.error(e?.message ?? "Falha");
                }
              }}
            >
              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">
                {f.original_path ?? f.file_name}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhum arquivo neste lote.
            </p>
          )}
        </div>
        {links.length > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            {links.length} candidato(s) já vinculado(s) a esta linha.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}