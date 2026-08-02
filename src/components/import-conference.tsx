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
  ExternalLink,
  FileWarning,
  Sparkles,
  ChevronDown,
  Loader2,
  Search,
  Building2,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";

import {
  approveImportRow,
  classifyImportRow,
  setImportRowStatus,
  reprocessBatchAmounts,
  bulkDecideCreditCardRows,
} from "@/lib/import.functions";
import { isCreditCardRow } from "@/lib/import-kind";
import {
  attachFileManually,
  detachRowFile,
} from "@/lib/receipt-matcher";
import { currencyBRL, parseBrlAmount, formatBrlNumber } from "@/lib/format";

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
  pending: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  approved: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  rejected: "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  ver_depois: "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/25",
};

function confirmedReceiptLink(links: any[]) {
  return (
    links.find(
      (link) =>
        link.is_primary &&
        (link.is_manual ||
          link.confidence === "high" ||
          link.confidence === "very_high" ||
          link.confidence === "manual_confirmed")
    ) ?? null
  );
}

function reviewReceiptLinks(links: any[]) {
  return links
    .filter((link) => !link.is_primary && !link.is_manual && link.confidence === "review")
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
}

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

  const [statusFilter, setStatusFilter] = useState<
    "all" | ReviewStatus | "identified" | "possible" | "no_receipt" | "duplicate" | "credit_card"
  >("pending");
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

  // Escopo da importação + imóveis elegíveis para vínculo
  const batchQ = useQuery({
    queryKey: ["conf-batch", batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_batches")
        .select("profile_id, scope_kind")
        .eq("id", batchId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const propertiesQ = useQuery({
    queryKey: ["conf-properties", batchQ.data?.profile_id, batchQ.data?.scope_kind],
    enabled: !!batchQ.data,
    queryFn: async () => {
      const isGeneral = batchQ.data?.scope_kind === "general" || !batchQ.data?.profile_id;
      let q = supabase.from("properties").select("id, name, profile_id").order("name");
      if (!isGeneral) q = q.eq("profile_id", batchQ.data!.profile_id!);
      const { data } = await q;
      return data ?? [];
    },
  });
  const propertyById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of propertiesQ.data ?? []) m.set(p.id, p);
    return m;
  }, [propertiesQ.data]);

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
      const confirmed = confirmedReceiptLink(links);
      const reviews = reviewReceiptLinks(links);

      const rowState: "identified" | "possible" | "no_receipt" = confirmed
        ? "identified"
        : reviews.length > 0
          ? "possible"
          : "no_receipt";

      // status filter
      if (statusFilter === "identified" && rowState !== "identified") return false;
      if (statusFilter === "possible" && rowState !== "possible") return false;
      if (statusFilter === "no_receipt" && rowState !== "no_receipt") return false;
      if (statusFilter === "duplicate" && !duplicateIds.has(r.id)) return false;
      // Cartões de crédito: somente pendentes de conferência
      if (statusFilter === "credit_card" && !(status === "pending" && isCreditCardRow(r)))
        return false;

      if (
        statusFilter !== "all" &&
        statusFilter !== "identified" &&
        statusFilter !== "possible" &&
        statusFilter !== "no_receipt" &&
        statusFilter !== "duplicate" &&
        statusFilter !== "credit_card" &&
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
        // Valores monetários seguem o padrão BR: "1.880,00" → 1880.00.
        // Sempre gravamos positivo — a natureza está em transaction_type.
        const n = parseBrlAmount(v);
        if (n !== null && Number.isFinite(n)) overrides[f.key] = Math.abs(n);
      } else {
        overrides[f.key] = String(v);
      }
    }
    // vínculo imóvel / conta geral (fora do FIELDS)
    if (values.property_id === "__general__") {
      overrides.property_id = null;
      overrides.general_account = true;
    } else if (values.property_id === "__none__" || values.property_id === "") {
      overrides.property_id = null;
      overrides.general_account = false;
    } else if (typeof values.property_id === "string") {
      overrides.property_id = values.property_id;
      overrides.general_account = false;
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
      identified = 0,
      possible = 0;
    for (const r of list) {
      const s = (r.review_status ?? "pending") as ReviewStatus;
      if (s === "approved") approved++;
      else if (s === "rejected") rejected++;
      else if (s === "ver_depois") ver++;
      else pending++;
      const links = linksByRow.get(r.id) ?? [];
      const confirmed = confirmedReceiptLink(links);
      const reviews = reviewReceiptLinks(links);

      if (confirmed) identified++;
      else if (reviews.length > 0) possible++;
      else no++;
    }
    return {
      total: list.length,
      pending,
      approved,
      rejected,
      ver,
      no,
      identified,
      possible,
      dup: duplicateIds.size,
      creditCardPending: list.filter(
        (r: any) => (r.review_status ?? "pending") === "pending" && isCreditCardRow(r),
      ).length,
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
      toast.success("Lançamento aprovado e incluído no Meu Cofre.");
      qc.invalidateQueries({ queryKey: ["conf-rows", batchId] });
      qc.invalidateQueries({ queryKey: ["conf-links", batchId] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
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
      toast.success("Salvo para revisar depois.");
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

  const reprocessFn = useServerFn(reprocessBatchAmounts);
  const [reprocessing, setReprocessing] = useState(false);
  async function handleReprocessAmounts() {
    setReprocessing(true);
    try {
      const res = await reprocessFn({ data: { batchId } });
      toast.success(
        `Valores recalculados: ${res.updated}/${res.scanned} lançamentos ajustados`,
      );
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reprocessar valores");
    } finally {
      setReprocessing(false);
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
        className="flex max-h-[94vh] w-[97vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0 rounded-2xl border border-border/60 shadow-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Sticky header */}
        <div className="shrink-0 border-b border-border/60 bg-background/95 px-6 py-4 backdrop-blur">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Conferência de comprovantes
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="font-semibold text-foreground">{counts.total}</span> linhas no total</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {counts.pending} pendentes</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {counts.approved} aprovadas</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> {counts.rejected} rejeitadas</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> {counts.identified} Identificados</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-600" /> {counts.possible} Possíveis</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-600" /> {counts.no} Sem comprovante</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span>{counts.dup} possíveis duplicidades</span>
            </div>
          </DialogHeader>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5">
              <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0" onClick={goPrev} disabled={activeIdx <= 0}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 text-[11px] font-medium tabular-nums text-foreground">
                Linha {filteredRows.length === 0 ? 0 : activeIdx + 1} de {filteredRows.length}
              </span>
              <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0" onClick={goNext} disabled={activeIdx >= filteredRows.length - 1}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-8 w-[200px] rounded-full text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({counts.total})</SelectItem>
                <SelectItem value="pending">Pendentes ({counts.pending})</SelectItem>
                <SelectItem value="approved">Aprovados ({counts.approved})</SelectItem>
                <SelectItem value="rejected">Rejeitados ({counts.rejected})</SelectItem>
                <SelectItem value="ver_depois">Ver depois ({counts.ver})</SelectItem>
                <SelectItem value="identified">Identificados ({counts.identified})</SelectItem>
                <SelectItem value="possible">Possíveis ({counts.possible})</SelectItem>
                <SelectItem value="no_receipt">Sem comprovante ({counts.no})</SelectItem>
                <SelectItem value="duplicate">Duplicidades ({counts.dup})</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
              <SelectTrigger className="h-8 w-[150px] rounded-full text-xs">
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
              className="ml-auto h-8 rounded-full"
              onClick={handleReclassify}
              disabled={savingAction !== null || !activeRow}
            >
              <Sparkles className="mr-1 h-3 w-3" /> Reanalisar com IA
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-full"
              onClick={async () => {
                try {
                  setReprocessing(true);
                  await reprocessFn({ data: { batchId } });
                  toast.success("Dados restaurados a partir dos originais");
                  invalidate();
                } catch (e: any) {
                  toast.error(e?.message ?? "Falha ao restaurar");
                } finally {
                  setReprocessing(false);
                }
              }}
              disabled={reprocessing || !activeRow}
              title="Restaura os valores monetários originais da planilha (imuláveis)."
            >
              <RotateCw className={`mr-1 h-3 w-3 ${reprocessing ? "animate-spin" : ""}`} />
              Restaurar originais
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-full"
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
        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-muted/20 via-muted/10 to-background">
          {activeRow ? (
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <ReceiptViewer
                row={activeRow}
                links={linksByRow.get(activeRow.id) ?? []}
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
                properties={propertiesQ.data ?? []}
                propertyById={propertyById}
                batchScope={batchQ.data?.scope_kind ?? "profile"}
                onChanged={invalidate}
              />
            </div>
          ) : (
            <div className="grid h-64 place-items-center text-sm text-muted-foreground">
              Nenhuma linha corresponde aos filtros.
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-6 py-3.5 backdrop-blur">
          <Button
            variant="ghost"
            onClick={handleUndo}
            disabled={savingAction !== null || !activeRow}
            className="h-10 rounded-full px-4 text-sm"
          >
            <Undo2 className="mr-2 h-4 w-4" /> Desfazer
          </Button>
          <Button
            variant="outline"
            onClick={() => activeRow && handleSaveOnly(collectOverrides())}
            disabled={savingAction !== null || !activeRow}
            className="h-10 rounded-full px-4 text-sm"
          >
            Salvar sem aprovar
          </Button>
          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <Button
            variant="outline"
            onClick={() => activeRow && handleReject(reason, collectOverrides())}
            disabled={savingAction !== null || !activeRow}
            className="h-10 rounded-full border-rose-200 px-4 text-sm text-rose-700 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
          >
            <XCircle className="mr-2 h-4 w-4" /> Rejeitar
          </Button>
          <Button
            variant="outline"
            onClick={() => activeRow && handleVerDepois(collectOverrides())}
            disabled={savingAction !== null || !activeRow}
            className="h-10 rounded-full border-amber-200 px-4 text-sm text-amber-700 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <Clock className="mr-2 h-4 w-4" /> Ver depois
          </Button>
          <Button
            onClick={() => activeRow && handleApprove(collectOverrides())}
            disabled={savingAction !== null || !activeRow}
            className="h-10 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition-all hover:from-emerald-600 hover:to-emerald-500 hover:shadow-lg hover:shadow-emerald-600/30"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar e continuar
            <ChevronRight className="ml-1 h-4 w-4" />
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
  properties,
  propertyById,
  batchScope,
  onChanged,
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
  properties: Array<{ id: string; name: string }>;
  propertyById: Map<string, any>;
  batchScope: string;
  onChanged: () => void;
}) {
  const meta = (row.ai_meta ?? {}) as Record<string, any>;
  const confirmed = confirmedReceiptLink(links);
  const reviews = reviewReceiptLinks(links);
  const status = (row.review_status ?? "pending") as ReviewStatus;

  const originalCategory = row.category_original ?? row.category ?? null;
  const aiSuggestedCategory = row.ai_category_suggestion ?? null;
  const aiConf = row.ai_category_confidence
    ? Math.round(Number(row.ai_category_confidence) * 100)
    : null;
  const aiPropertyId = row.ai_property_id ?? null;
  const aiPropertyConf = row.ai_property_confidence
    ? Math.round(Number(row.ai_property_confidence) * 100)
    : null;
  const aiProperty = aiPropertyId ? propertyById.get(aiPropertyId) : null;

  const propertyValue =
    values.property_id ??
    (row.property_id ? row.property_id : row.general_account ? "__general__" : "__none__");

  // Groupings
  const HIGHLIGHT_KEYS = ["transaction_date", "amount", "transaction_type"];
  const MAIN_KEYS = ["currency", "category", "payee", "bank", "payment_method"];
  const SECONDARY_KEYS = ["subcategory", "description", "card", "card_last4", "holder", "account"];
  const NOTE_KEYS = ["notes"];

  const fieldByKey = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

  const renderField = (
    key: string,
    opts: { highlight?: boolean; wide?: boolean } = {},
  ) => {
    const f = fieldByKey[key];
    if (!f) return null;
    const m = meta[f.key] ?? {};
    const conf = typeof m.confidence === "number" ? Math.round(m.confidence * 100) : null;
    const v = values[f.key] ?? "";
    const isTextarea = f.type === "textarea";

    return (
      <div
        key={f.key}
        className={`group relative rounded-xl border border-border/60 bg-background px-3 py-2.5 transition-colors hover:border-border ${
          opts.highlight ? "bg-gradient-to-br from-primary/5 to-transparent" : ""
        } ${opts.wide || isTextarea ? "col-span-2" : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {f.label}
          </Label>
          {conf !== null && (
            <span
              className={`text-[9px] font-medium tabular-nums ${
                conf >= 80
                  ? "text-emerald-600 dark:text-emerald-400"
                  : conf >= 50
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {conf}%
            </span>
          )}
        </div>
        {f.type === "textarea" ? (
          <Textarea
            rows={2}
            className="mt-1.5 min-h-[56px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            value={v}
            onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
          />
        ) : f.type === "select" ? (
          <Select value={String(v || "")} onValueChange={(nv) => setValues((s) => ({ ...s, [f.key]: nv }))}>
            <SelectTrigger className="mt-1 h-8 border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus:ring-0">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {(f.options ?? []).map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className={`mt-0.5 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 ${
              opts.highlight ? "h-8 text-base font-semibold" : "h-7 text-sm"
            }`}
            value={v}
            inputMode={f.key === "amount" ? "decimal" : undefined}
            placeholder={f.key === "amount" ? "0,00" : "—"}
            onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
            onBlur={
              f.key === "amount"
                ? (e) => {
                    const n = parseBrlAmount(e.target.value);
                    if (n !== null) {
                      setValues((s) => ({ ...s, amount: formatBrlNumber(n) }));
                    }
                  }
                : undefined
            }
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Grupo 1 — status */}
      <section className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[status]}`}>
              {STATUS_LABEL[status]}
            </Badge>
            {isDuplicate && (
              <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                duplicidade
              </Badge>
            )}
          </div>
          {confirmed && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Comprovante identificado
            </div>
          )}
          {!confirmed && reviews.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <FileWarning className="h-3.5 w-3.5" /> Possível comprovante — ainda não vinculado
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Linha</p>
            <p className="mt-0.5 font-semibold tabular-nums text-foreground">#{row.row_number}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ID</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{row.id}</p>
          </div>
        </div>
      </section>

      {/* Grupo 2 — destaques + principais */}
      <section className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dados do lançamento
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {HIGHLIGHT_KEYS.map((k) => renderField(k, { highlight: true }))}
          {MAIN_KEYS.map((k) => renderField(k))}
          {SECONDARY_KEYS.map((k) => renderField(k))}
          {NOTE_KEYS.map((k) => renderField(k, { wide: true }))}
        </div>
      </section>

      {/* Grupo 2b — categoria: original vs sugerida */}
      {(originalCategory || aiSuggestedCategory) && (
        <section className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Categoria
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Original da planilha
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {originalCategory ?? "—"}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 rounded-full px-2 text-[11px]"
                onClick={() =>
                  setValues((s) => ({ ...s, category: originalCategory ?? "" }))
                }
                disabled={!originalCategory}
              >
                Manter original
              </Button>
            </div>
            <div
              className={`rounded-xl border px-3 py-2.5 ${
                aiSuggestedCategory
                  ? "border-amber-200/60 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
                  : "border-border/60 bg-muted/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Lightbulb className="h-3 w-3" /> Sugerida pela IA
                </p>
                {aiConf !== null && (
                  <span
                    className={`text-[10px] font-semibold tabular-nums ${
                      aiConf >= 75
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {aiConf}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {aiSuggestedCategory ?? "Sem sugestão"}
              </p>
              {row.ai_category_reason && (
                <p className="mt-1 text-[11px] text-muted-foreground">{row.ai_category_reason}</p>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 rounded-full px-2 text-[11px]"
                onClick={() =>
                  setValues((s) => ({ ...s, category: aiSuggestedCategory ?? "" }))
                }
                disabled={!aiSuggestedCategory}
              >
                Usar sugestão
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Grupo 2c — Imóvel relacionado */}
      <section className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> Imóvel relacionado
          </h3>
          {batchScope === "general" && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              lote: conta geral
            </span>
          )}
        </div>
        <Select
          value={String(propertyValue)}
          onValueChange={(nv) => setValues((s) => ({ ...s, property_id: nv }))}
        >
          <SelectTrigger className="h-10 text-sm">
            <SelectValue placeholder="Escolher imóvel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Imóvel não identificado</SelectItem>
            <SelectItem value="__general__">Conta geral (sem imóvel)</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {aiProperty && String(propertyValue) !== aiProperty.id && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200/60 bg-amber-50/50 p-2.5 text-[11px] dark:border-amber-500/20 dark:bg-amber-500/5">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground">
                Sugestão da IA: <span className="font-semibold">{aiProperty.name}</span>
                {aiPropertyConf !== null && (
                  <span className="ml-2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {aiPropertyConf}%
                  </span>
                )}
              </p>
              {row.ai_property_reason && (
                <p className="mt-0.5 text-muted-foreground">{row.ai_property_reason}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 rounded-full px-2 text-[11px]"
              onClick={() => setValues((s) => ({ ...s, property_id: aiProperty.id }))}
            >
              Aceitar
            </Button>
          </div>
        )}
        {!aiProperty && !row.property_id && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Sem histórico suficiente para sugerir automaticamente. Escolha manualmente ou deixe em "Imóvel não identificado".
          </p>
        )}
      </section>

      {/* Grupo 3 — dados originais / IA */}
      <section className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Informações originais (extraídas da planilha)
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          {["amount", "transaction_date", "category", "payee"].map((k) => {
            const f = fieldByKey[k];
            if (!f) return null;
            const orig = meta[k]?.original ?? row.raw_data?.[k] ?? "—";
            return (
              <div key={k} className="min-w-0">
                <span className="text-muted-foreground">{f.label} original: </span>
                <span className="font-mono text-foreground">{String(orig || "—")}</span>
              </div>
            );
          })}
          {row.source_sheet && (
            <div className="col-span-2 min-w-0">
              <span className="text-muted-foreground">Aba origem: </span>
              <span className="font-mono text-foreground">{row.source_sheet}</span>
            </div>
          )}
        </div>

        <div className="mt-3">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Motivo (rejeição / anotação)
          </Label>
          <Textarea
            rows={2}
            className="mt-1.5 resize-none rounded-lg text-xs"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: comprovante ilegível, valor divergente…"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowRaw((s) => !s)}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showRaw ? "rotate-180" : ""}`} />
          {showRaw ? "Ocultar" : "Ver"} JSON original
        </button>
        {showRaw && (
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-border/60 bg-background p-2 text-[10px] leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(row.raw_data, null, 2)}
          </pre>
        )}
      </section>

      {/* Grupo 4 — validação */}
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
            Auditoria de Precisão Ativa
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Modo de <strong>exatidão absoluta</strong> ligado. Associações automáticas exigem correspondência idêntica (R$ 0,00 de diferença) e validação rigorosa de auditoria.
        </p>
      </section>

      {confirmed && (
        <section className="rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Vínculo de Alta Confiança
            </h3>
          </div>
          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-200/80">
            {confirmed.is_manual ? "Associação manual realizada pelo usuário." : "Valor, data e favorecido validados com precisão absoluta."}
          </p>
        </section>
      )}

      {!confirmed && reviews.length > 0 && (
        <section className="rounded-2xl border border-amber-200/60 bg-amber-50/40 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="mb-2 flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Revisão Necessária
            </h3>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
              Valor compatível, mas existem divergências ou dados ausentes.
            </p>
            {reviews[0].match_reasons
              ?.filter((r: any) => r.key === "divergence" || r.field === "unknown")
              .map((reason: any, idx: number) => (
                <div key={idx} className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                  <span>{reason.label}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {!confirmed && reviews.length > 0 && (
        <section className="mt-3 flex flex-col gap-2 rounded-2xl border border-amber-200/60 bg-amber-50/20 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Candidato sugerido ({reviews.length})
            </h4>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-full border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                onClick={async () => {
                  try {
                    const confirmFn = (await import("@/lib/receipt-matcher")).confirmReviewCandidate;
                    await confirmFn(reviews[0].id);
                    toast.success("Comprovante vinculado com sucesso");
                    onChanged();
                  } catch (e: any) {
                    toast.error(e?.message ?? "Falha ao vincular");
                  }
                }}
              >
                Vincular este comprovante
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full text-[10px] font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={async () => {
                  try {
                    const rejectFn = (await import("@/lib/receipt-matcher")).rejectReviewCandidate;
                    await rejectFn(reviews[0].id);
                    toast.success("Candidato removido");
                    onChanged();
                  } catch (e: any) {
                    toast.error(e?.message ?? "Falha ao rejeitar");
                  }
                }}
              >
                Não é este
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function hydrateValues(row: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of FIELDS) {
    if (f.key === "amount") {
      out[f.key] = typeof row.amount === "number" ? formatBrlNumber(row.amount) : "";
    } else {
      out[f.key] = row[f.key] ?? "";
    }
  }
  out.property_id = row.property_id
    ? row.property_id
    : row.general_account
      ? "__general__"
      : "__none__";
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
  const confirmed = confirmedReceiptLink(links);
  const reviews = reviewReceiptLinks(links);

  const displayLink = confirmed || (reviews.length > 0 ? reviews[0] : null);
  const displayFile = displayLink ? fileById.get(displayLink.file_id) : null;

  const [page, setPage] = useState<number>(displayLink?.page_number ?? 1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    setPage(displayLink?.page_number ?? 1);
    setZoom(1);
    setRotation(0);
  }, [row.id, displayLink?.id]);

  useEffect(() => {
    let cancelled = false;
    async function fetchUrl() {
      if (!displayFile?.storage_path) {
        setSignedUrl(null);
        return;
      }
      const { data } = await supabase.storage
        .from("receipts")
        .createSignedUrl(displayFile.storage_path, 3600);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    }
    fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [displayFile?.storage_path]);

  const isPdf = (displayFile?.mime_type ?? "").includes("pdf") || (displayFile?.extension ?? "").toLowerCase() === "pdf";
  const pageCount = displayFile?.page_count ?? 1;

  const [manualOpen, setManualOpen] = useState(false);

  async function markUnlocated() {
    if (!confirmed) return;
    await detachRowFile(confirmed.id);
    toast.success("Comprovante desvinculado");
    onChanged();
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
      {/* File name header */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          <FileWarning className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {displayFile?.file_name ?? "Comprovante não identificado"}
          </p>
          {displayFile?.original_path && displayFile.original_path !== displayFile.file_name && (
            <p className="truncate font-mono text-[10px] text-muted-foreground">{displayFile.original_path}</p>
          )}
        </div>
        {confirmed ? (
          <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Localizado
          </Badge>
        ) : reviews.length > 0 ? (
          <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            Possível
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            Não localizado
          </Badge>
        )}
        <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={() => setSwapOpen(true)}>
          <Paperclip className="mr-1 h-3 w-3" /> Trocar
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/30 px-3 py-2 text-xs">
        <div className="flex items-center gap-0.5 rounded-full border border-border bg-background p-0.5">
          <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[42px] text-center text-[11px] tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setZoom(1)}>
          Ajustar
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 rounded-full p-0" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 rounded-full p-0" onClick={() => setFullscreen(true)} disabled={!signedUrl}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        {signedUrl && (
          <a href={signedUrl} target="_blank" rel="noreferrer" className="inline-flex">
            <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir original
            </Button>
          </a>
        )}
        <div className="ml-auto flex items-center gap-1">
          {isPdf && pageCount > 1 && (
            <div className="flex items-center gap-0.5 rounded-full border border-border bg-background p-0.5">
              <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-1 text-[11px] tabular-nums">
                {page}/{pageCount}
              </span>
              <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0" onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-full text-xs text-muted-foreground hover:text-rose-600"
            onClick={markUnlocated}
            disabled={!confirmed}
          >
            <FileWarning className="mr-1 h-3.5 w-3.5" /> Marcar não localizado
          </Button>
        </div>
      </div>

      {/* Document window */}
      <div className="min-h-[520px] bg-[radial-gradient(circle_at_1px_1px,theme(colors.border/30)_1px,transparent_0)] [background-size:16px_16px] p-6">
        {!displayFile ? (
          <div className="grid h-[440px] place-items-center rounded-xl border border-dashed border-border bg-background/60 text-center">
            <div className="max-w-xs px-6">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                <FileWarning className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">Comprovante não identificado</p>
              <p className="mt-1 text-xs text-muted-foreground">Nenhum arquivo do lote foi associado a esta linha com segurança.</p>
              <div className="mt-4">
                <Button size="sm" className="rounded-full" onClick={() => setSwapOpen(true)}>
                  <Paperclip className="mr-1 h-3.5 w-3.5" /> Associar manualmente
                </Button>
              </div>
            </div>
          </div>
        ) : !signedUrl ? (
          <div className="grid h-[440px] place-items-center rounded-xl bg-background/60 text-sm text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando comprovante…
            </div>
          </div>
        ) : (
          <div className="overflow-auto rounded-xl">
            <div
              className="mx-auto origin-top"
              style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transition: "transform 160ms ease" }}
            >
              {isPdf ? (
                <PdfPage url={signedUrl} pageNumber={page} />
              ) : (
                <img
                  src={signedUrl}
                  alt={displayFile.file_name}
                  className="mx-auto max-w-full rounded-lg bg-white shadow-xl ring-1 ring-border/60"
                  draggable={false}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Busca manual — collapsible */}
      <div className="border-t border-border/60 bg-muted/20 px-4 py-2.5 text-xs">
        <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary">
              Não encontrou o comprovante correto? Associar manualmente
              <ChevronDown className={`h-3 w-3 transition-transform ${manualOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setSwapOpen(true)}>
              <Paperclip className="mr-1 h-3 w-3" /> Buscar arquivo no lote
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Fullscreen */}
      {fullscreen && signedUrl && (
        <Dialog open onOpenChange={(o) => !o && setFullscreen(false)}>
          <DialogContent className="max-w-[95vw]">
            <DialogHeader>
              <DialogTitle>{displayFile?.file_name}</DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
}