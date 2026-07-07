import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { currencyBRL, dateBR, paymentMethodLabel, transactionTypeLabel } from "@/lib/format";
import { CheckCircle2, XCircle, AlertTriangle, Search, ExternalLink, FileText, Loader2, Inbox, Copy, Archive, Trash2, GitCompareArrows, Download, Plus, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { approveReceipt, rejectReceipt, bulkReceiptAction, bulkUpdateReceipts, deleteReceipts, analyzeReceipt } from "@/lib/receipts.functions";
import { useCan } from "@/lib/permissions";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/app/vault")({
  head: () => ({ meta: [{ title: "Cofre de comprovantes — Meu Cofre" }] }),
  validateSearch: (s) => z.object({ receipt: z.string().optional() }).parse(s),
  component: VaultPage,
});

type QuickFilter = "all" | "pending" | "suspected" | "high_dup" | "approved" | "rejected" | "archived";

type PreviewState = {
  loading: boolean;
  url: string | null;
  downloadUrl: string | null;
  error: string | null;
  isObjectUrl?: boolean;
};

const EMPTY_PREVIEW: PreviewState = { loading: false, url: null, downloadUrl: null, error: null, isObjectUrl: false };

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeDateValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const br = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  return null;
}

function normalizeAmountValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePaymentValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = stripAccents(value);
  if (!text) return null;
  if (text.includes("pix") || text.includes("e2e")) return "pix";
  if (text.includes("boleto") || text.includes("codigo de barras")) return "boleto";
  if (text.includes("ted")) return "ted";
  if (text.includes("deb")) return "debito";
  if (text.includes("parcel")) return "credito_parcelado";
  if (text.includes("cred")) return "credito_vista";
  if (text.includes("dinheiro") || text.includes("especie")) return "dinheiro";
  if (text.includes("transf") || text.includes("doc")) return "transferencia";
  return "outro";
}

function normalizeTransactionValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = stripAccents(value).replace(/[\s-]+/g, "_");
  if (!text) return null;
  if (text.includes("invest")) return "investimento";
  if (text.includes("fix")) return "gasto_fixo";
  if (text.includes("vari")) return "gasto_variavel";
  if (text.includes("pessoal")) return "pessoal";
  if (text.includes("empresa")) return "empresarial";
  if (text.includes("patrim")) return "patrimonial";
  if (text.includes("desp")) return "despesa";
  return null;
}

function deepFind(source: unknown, aliases: string[], depth = 0): unknown {
  if (!source || typeof source !== "object" || depth > 4) return null;
  const record = source as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const normalized = stripAccents(key).replace(/[\s_-]+/g, "");
    if (aliases.some((alias) => normalized === stripAccents(alias).replace(/[\s_-]+/g, ""))) return record[key];
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = deepFind(value, aliases, depth + 1);
      if (found != null && found !== "") return found;
    }
  }
  return null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function buildAutoDescription(receipt: any) {
  if (receipt.description) return receipt.description;
  const parts: string[] = [];
  const recipient = receipt.recipient_name ? `para ${receipt.recipient_name}` : null;
  const amount = receipt.amount != null ? `no valor de ${currencyBRL(Number(receipt.amount))}` : null;
  const date = receipt.payment_date ? `realizado em ${dateBR(receipt.payment_date)}` : null;
  const by = receipt.bank_name ? `pelo banco ${receipt.bank_name}` : receipt.payment_method ? `via ${paymentMethodLabel[receipt.payment_method as keyof typeof paymentMethodLabel] ?? receipt.payment_method}` : null;
  if (recipient) parts.push(recipient);
  if (amount) parts.push(amount);
  if (date) parts.push(date);
  if (by) parts.push(by);
  if (parts.length) return `Pagamento ${parts.join(", ")}.`;
  return receipt.file_name ? `Comprovante ${receipt.file_name}` : null;
}

function hydrateReceiptForConference(receipt: any, categories: any[] = [], properties: any[] = []) {
  const ocr = receipt.ocr_data && typeof receipt.ocr_data === "object" ? receipt.ocr_data : {};
  const hydrated = { ...receipt };
  hydrated.payment_date = hydrated.payment_date ?? normalizeDateValue(deepFind(ocr, ["payment_date", "data_pagamento", "data", "detected_date"]));
  hydrated.amount = hydrated.amount ?? normalizeAmountValue(deepFind(ocr, ["amount", "valor", "valor_pago", "detected_amount"]));
  hydrated.recipient_name = hydrated.recipient_name ?? firstText(deepFind(ocr, ["recipient_name", "beneficiario", "favorecido", "destinatario", "payee", "detected_payee"]));
  hydrated.recipient_tax_id = hydrated.recipient_tax_id ?? firstText(deepFind(ocr, ["recipient_tax_id", "cpf_cnpj", "documento"]));
  hydrated.bank_name = hydrated.bank_name ?? firstText(deepFind(ocr, ["bank_name", "banco", "banco_origem", "detected_bank"]));
  hydrated.auth_code = hydrated.auth_code ?? firstText(deepFind(ocr, ["auth_code", "codigo_autenticacao", "autenticacao", "id_transacao", "e2e"]));
  hydrated.payment_method = hydrated.payment_method ?? normalizePaymentValue(deepFind(ocr, ["payment_method", "forma_pagamento", "metodo_pagamento"]));
  hydrated.transaction_type = hydrated.transaction_type ?? normalizeTransactionValue(deepFind(ocr, ["transaction_type", "tipo_transacao", "tipo"]));
  hydrated.description = hydrated.description ?? firstText(deepFind(ocr, ["description", "descricao", "historico"]));

  const suggestedCategory = firstText(deepFind(ocr, ["suggested_category", "categoria_sugerida", "categoria", "category"]));
  if (!hydrated.category_id && suggestedCategory) {
    hydrated.category_id = categories.find((c) => stripAccents(c.name) === stripAccents(suggestedCategory))?.id ?? null;
  }
  const suggestedProperty = firstText(deepFind(ocr, ["property", "imovel", "imovel_vinculado", "property_name"]));
  if (!hydrated.property_id && suggestedProperty) {
    hydrated.property_id = properties.find((p) => stripAccents(p.name) === stripAccents(suggestedProperty))?.id ?? null;
  }
  hydrated.description = buildAutoDescription(hydrated);
  return hydrated;
}

function getStoragePath(receipt: any) {
  const raw = firstText(receipt.file_path, receipt.storage_path, receipt.file_url);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/\/object\/(?:sign|public)\/receipts\/([^?]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
  return raw.replace(/^\/+/, "").replace(/^receipts\//, "");
}

function inferMime(name?: string | null, mime?: string | null) {
  if (mime) return mime;
  const lower = (name ?? "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function hasExtractedConferenceData(receipt: any) {
  return Boolean(receipt.payment_date || receipt.amount != null || receipt.recipient_name || receipt.bank_name || receipt.auth_code || receipt.payment_method || receipt.transaction_type || receipt.category_id);
}

function ZoomPanFrame({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const sizerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  const clamp = (v: number) => Math.min(4, Math.max(0.4, v));

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      if (w && h) setNatural((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const id = window.setInterval(measure, 500);
    return () => { ro.disconnect(); window.clearInterval(id); };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    el.scrollLeft = d.sl - (e.clientX - d.x);
    el.scrollTop = d.st - (e.clientY - d.y);
  };
  const endDrag = () => {
    dragRef.current = null;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom((z) => clamp(z + (e.deltaY < 0 ? 0.15 : -0.15)));
  };

  return (
    <div className="relative h-[520px]">
      <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-md border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => clamp(z - 0.2))} title="Diminuir zoom"><ZoomOut className="h-4 w-4" /></Button>
        <span className="min-w-[3rem] self-center text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => clamp(z + 0.2))} title="Aumentar zoom"><ZoomIn className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(1)} title="Redefinir zoom"><Maximize2 className="h-4 w-4" /></Button>
      </div>
      <div
        ref={scrollRef}
        className="h-full w-full select-none overflow-scroll rounded bg-background"
        style={{ cursor: "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onWheel={onWheel}
      >
        <div
          ref={sizerRef}
          style={{
            width: natural.w ? natural.w * zoom : undefined,
            height: natural.h ? natural.h * zoom : undefined,
          }}
        >
          <div
            ref={innerRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left", display: "inline-block" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfCanvasPreview({ url, fileName }: { url: string; fileName?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [failedBeforeCanvas, setFailedBeforeCanvas] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: any = null;
    let hasCanvas = false;

    (async () => {
      try {
        setState("loading");
        setErrorText(null);
        setCanvasReady(false);
        setFailedBeforeCanvas(false);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        task = pdfjs.getDocument({ url });
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        if (cancelled || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        // Render at high resolution so zooming stays sharp
        const scale = Math.min(Math.max(900 / baseViewport.width, 1.5), 3);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        // Display at a comfortable base size; ZoomPanFrame handles zoom.
        const displayWidth = Math.min(460, Math.floor(viewport.width));
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = "auto";
        hasCanvas = true;
        setCanvasReady(true);
        await page.render({ canvas, viewport }).promise;
        if (!cancelled) setState("ready");
      } catch (error) {
        if (!cancelled) {
          if (hasCanvas || (canvasRef.current && canvasRef.current.width > 0 && canvasRef.current.height > 0)) {
            setCanvasReady(true);
            setState("ready");
          } else {
            setErrorText(error instanceof Error ? error.message : String(error));
            setFailedBeforeCanvas(true);
            setState("error");
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.destroy().catch(() => undefined);
    };
  }, [url]);

  return (
    <div className="relative p-3">
      {state === "loading" && !canvasReady && <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando PDF…</div>}
      {failedBeforeCanvas && <div className="p-6 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-2 h-8 w-8" /> Não foi possível renderizar {fileName ?? "este PDF"} dentro do modal. Use abrir em nova aba ou baixar.{errorText ? <span className="mt-2 block text-xs opacity-70">{errorText}</span> : null}</div>}
      <canvas ref={canvasRef} aria-label={fileName ? `Prévia de ${fileName}` : "Prévia do PDF"} className="rounded shadow-sm" draggable={false} />
    </div>
  );
}

function statusBadge(s: string) {
  if (s === "approved") return <Badge className="bg-success text-success-foreground hover:bg-success">Aprovado</Badge>;
  if (s === "duplicate") return <Badge className="bg-orange-500 text-white hover:bg-orange-500">Duplicado</Badge>;
  if (s === "rejected") return <Badge variant="destructive">Rejeitado</Badge>;
  if (s === "archived") return <Badge variant="secondary" className="bg-muted text-muted-foreground">Arquivado</Badge>;
  return <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">Pendente</Badge>;
}

function dupScoreBadge(score: number | null | undefined) {
  const s = Number(score ?? 0);
  if (s >= 80) return <Badge className="gap-1 bg-destructive text-destructive-foreground hover:bg-destructive"><AlertTriangle className="h-3 w-3" /> Alta {s}</Badge>;
  if (s >= 50) return <Badge className="gap-1 bg-yellow-500 text-white hover:bg-yellow-500"><AlertTriangle className="h-3 w-3" /> Possível {s}</Badge>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function VaultPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const approve = useServerFn(approveReceipt);
  const reject = useServerFn(rejectReceipt);
  const analyze = useServerFn(analyzeReceipt);
  const bulkAction = useServerFn(bulkReceiptAction);
  const bulkUpdate = useServerFn(bulkUpdateReceipts);
  const bulkDelete = useServerFn(deleteReceipts);
  const canApprove = useCan("approveReceipts");
  const canBulk = useCan("bulkActions");
  const canDelete = useCan("deleteData");

  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("pending");
  const [profileId, setProfileId] = useState<string>("all");
  const [bankId, setBankId] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<any | null>(null);
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (preview.isObjectUrl && preview.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview.isObjectUrl, preview.url]);

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const categories = useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [] });
  const properties = useQuery({ queryKey: ["properties"], queryFn: async () => (await supabase.from("properties").select("id, name").order("name")).data ?? [] });
  const banks = useQuery({ queryKey: ["banks"], queryFn: async () => (await supabase.from("banks").select("id, name").order("name")).data ?? [] });

  const receipts = useQuery({
    queryKey: ["receipts", quick, profileId, bankId, categoryId],
    queryFn: async () => {
      let qb = supabase.from("receipts").select("*, categories(name), financial_profiles(name), banks(name)").order("created_at", { ascending: false });
      if (quick === "pending") qb = qb.eq("status", "pending");
      else if (quick === "approved") qb = qb.eq("status", "approved");
      else if (quick === "rejected") qb = qb.eq("status", "rejected");
      else if (quick === "archived") qb = qb.eq("status", "archived");
      else if (quick === "suspected") qb = qb.gte("duplicate_score", 50);
      else if (quick === "high_dup") qb = qb.gte("duplicate_score", 80);
      if (profileId !== "all") qb = qb.eq("profile_id", profileId);
      if (bankId !== "all") qb = qb.eq("bank_id", bankId);
      if (categoryId !== "all") qb = qb.eq("category_id", categoryId);
      const { data, error } = await qb.limit(300);
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => { setSelectedIds(new Set()); }, [quick, profileId, bankId, categoryId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return receipts.data ?? [];
    return (receipts.data ?? []).filter((r: any) =>
      [r.recipient_name, r.description, r.bank_name, r.auth_code, String(r.amount ?? "")].filter(Boolean).some((v: string) => v.toLowerCase().includes(term)),
    );
  }, [q, receipts.data]);

  const allSelected = filtered.length > 0 && filtered.every((r: any) => selectedIds.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r: any) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["receipts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["audit_logs"] });
  };

  const doBulk = async (action: "approve" | "reject" | "duplicate" | "archive") => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const res = await bulkAction({ data: { receiptIds: Array.from(selectedIds), action } });
      toast.success(`${res.count} comprovante(s) atualizados`);
      setSelectedIds(new Set()); invalidate();
    } catch (e: any) { toast.error(e.message ?? "Falha na ação"); } finally { setBusy(false); }
  };

  const doBulkPatch = async (patch: any, label: string) => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const res = await bulkUpdate({ data: { receiptIds: Array.from(selectedIds), patch } });
      toast.success(`${label} aplicado a ${res.count} comprovante(s)`);
      invalidate();
    } catch (e: any) { toast.error(e.message ?? "Falha"); } finally { setBusy(false); }
  };

  const doBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const res = await bulkDelete({ data: { receiptIds: Array.from(selectedIds) } });
      toast.success(`${res.count} comprovante(s) excluídos`);
      setSelectedIds(new Set()); invalidate();
    } catch (e: any) { toast.error(e.message ?? "Falha"); } finally { setBusy(false); }
  };

  const openEdit = async (r: any) => {
    const hydrated = hydrateReceiptForConference(r, categories.data ?? [], properties.data ?? []);
    setEditing(hydrated);
    setRejectNote("");
    setPreview({ ...EMPTY_PREVIEW, loading: true });

    const patch: any = {};
    for (const key of ["payment_date", "amount", "recipient_name", "recipient_tax_id", "bank_name", "auth_code", "payment_method", "transaction_type", "description", "category_id", "property_id"] as const) {
      if ((r[key] == null || r[key] === "") && hydrated[key] != null && hydrated[key] !== "") patch[key] = hydrated[key];
    }
    if (Object.keys(patch).length) {
      await supabase.from("receipts").update(patch).eq("id", r.id);
      qc.invalidateQueries({ queryKey: ["receipts"] });
    }

    const path = getStoragePath(hydrated);
    if (!path) {
      setPreview({ loading: false, url: null, downloadUrl: null, error: "Este comprovante não tem caminho de arquivo salvo." });
      return;
    }
    const [{ data, error }, downloadResult, downloaded] = await Promise.all([
      supabase.storage.from("receipts").createSignedUrl(path, 60 * 10),
      (supabase.storage.from("receipts") as any).createSignedUrl(path, 60 * 10, { download: hydrated.file_name ?? true }),
      supabase.storage.from("receipts").download(path),
    ]);
    if (downloaded.error || !downloaded.data) {
      setPreview({ loading: false, url: null, downloadUrl: null, error: `Arquivo não encontrado no bucket receipts para o caminho: ${path}`, isObjectUrl: false });
      return;
    }
    const objectUrl = URL.createObjectURL(downloaded.data);
    if (error || !data?.signedUrl) {
      setPreview({ loading: false, url: objectUrl, downloadUrl: objectUrl, error: error?.message ?? null, isObjectUrl: true });
      return;
    }
    setPreview({ loading: false, url: objectUrl, downloadUrl: downloadResult?.data?.signedUrl ?? data.signedUrl, error: null, isObjectUrl: true });
  };

  // Deep-link: open a specific receipt's review dialog via ?receipt=<id>
  useEffect(() => {
    const id = search.receipt;
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("*, categories(name), financial_profiles(name), banks(name)")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Comprovante não encontrado ou sem permissão");
      } else {
        // ensure it shows up regardless of active filter
        setQuick("all");
        await openEdit(data);
      }
      navigate({ search: {}, replace: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.receipt]);

  const updateReceipt = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("receipts").update(patch).eq("id", editing.id);
      if (error) throw error;
      setEditing((prev: any) => (prev ? { ...prev, ...patch } : prev));
    },
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["receipts"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !editing) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return toast.error("Sessão expirada");
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name, default_type: editing.transaction_type ?? "gasto_variavel" })
      .select("id, name")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Não foi possível criar a categoria");
    setNewCategoryName("");
    updateReceipt.mutate({ category_id: data.id });
    qc.invalidateQueries({ queryKey: ["categories"] });
    toast.success("Categoria criada");
  };

  const analyzeCurrentReceipt = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await analyze({ data: { receiptId: editing.id } });
      if (!res.ok) throw new Error(res.error ?? "Não foi possível analisar o comprovante");
      const { data } = await supabase.from("receipts").select("*, categories(name), financial_profiles(name), banks(name)").eq("id", editing.id).single();
      if (data) await openEdit(data);
      invalidate();
      toast.success("Comprovante analisado");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao analisar");
    } finally {
      setBusy(false);
    }
  };

  const approveCurrentReceipt = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await approve({ data: { receiptId: editing.id } });
      toast.success("Aprovado");
      invalidate();
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao aprovar");
    } finally {
      setBusy(false);
    }
  };

  const rejectCurrentReceipt = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await reject({ data: { receiptId: editing.id, reason: "rejected", note: rejectNote || undefined } });
      toast.success("Comprovante rejeitado");
      invalidate();
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao rejeitar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Cofre de comprovantes</h1>
        <p className="text-sm text-muted-foreground">Conferência em lote, comparação de duplicados e organização.</p>
      </div>

      <Tabs value={quick} onValueChange={(v) => setQuick(v as QuickFilter)}>
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="suspected">Possíveis duplicados</TabsTrigger>
          <TabsTrigger value="high_dup">Alta chance</TabsTrigger>
          <TabsTrigger value="approved">Aprovados</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitados</TabsTrigger>
          <TabsTrigger value="archived">Arquivados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por destinatário, valor, descrição, banco…" className="pl-9" />
          </div>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger><SelectValue placeholder="Perfil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={bankId} onValueChange={setBankId}>
            <SelectTrigger><SelectValue placeholder="Banco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os bancos</SelectItem>
              {(banks.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {(categories.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {receipts.isLoading ? (
        <Card className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Inbox className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">Nenhum comprovante encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou envie novos comprovantes.</p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Duplicidade</TableHead>
                    <TableHead>Enviado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: any) => {
                    const checked = selectedIds.has(r.id);
                    const highlight = r.duplicate_score >= 80 ? "bg-destructive/5" : r.duplicate_score >= 50 ? "bg-yellow-500/5" : "";
                    return (
                      <TableRow key={r.id} className={`${highlight} cursor-pointer`} onClick={() => openEdit(r)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={checked} onCheckedChange={() => toggleOne(r.id)} />
                        </TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{dateBR(r.payment_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm font-semibold">{currencyBRL(Number(r.amount ?? 0))}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm">{r.recipient_name || "—"}</TableCell>
                        <TableCell className="text-xs">{r.banks?.name ?? r.bank_name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.financial_profiles?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.categories?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.transaction_type ? transactionTypeLabel[r.transaction_type as keyof typeof transactionTypeLabel] : "—"}</TableCell>
                        <TableCell>{dupScoreBadge(r.duplicate_score)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateBR(r.created_at)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {r.duplicate_of && (
                              <Button variant="ghost" size="sm" onClick={() => setCompareId(r.id)} title="Comparar duplicado"><GitCompareArrows className="h-4 w-4" /></Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Editar</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((r: any) => {
              const checked = selectedIds.has(r.id);
              const highlight = r.duplicate_score >= 80 ? "border-destructive/50" : r.duplicate_score >= 50 ? "border-yellow-500/50" : "";
              return (
                <Card key={r.id} className={`p-3 ${highlight}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox checked={checked} onCheckedChange={() => toggleOne(r.id)} className="mt-1" />
                    <button onClick={() => openEdit(r)} className="flex-1 min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{r.recipient_name || r.description || "Comprovante"}</p>
                        {statusBadge(r.status)}
                        {dupScoreBadge(r.duplicate_score)}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {dateBR(r.payment_date)} • {r.banks?.name ?? r.bank_name ?? "—"} • {r.categories?.name ?? "sem categoria"}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{currencyBRL(Number(r.amount ?? 0))}</p>
                    </button>
                    {r.duplicate_of && (
                      <Button variant="ghost" size="icon" onClick={() => setCompareId(r.id)}><GitCompareArrows className="h-4 w-4" /></Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Sticky bulk toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur md:left-64">
          <div className="mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{selectedIds.size} selecionado(s)</Badge>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            <div className="flex flex-wrap gap-2">
              {canApprove && <BulkConfirm label="Aprovar" icon={CheckCircle2} tone="success" count={selectedIds.size} onConfirm={() => doBulk("approve")} disabled={busy} />}
              {canApprove && <BulkConfirm label="Rejeitar" icon={XCircle} tone="destructive" count={selectedIds.size} onConfirm={() => doBulk("reject")} disabled={busy} />}
              {canApprove && <BulkConfirm label="Marcar duplicado" icon={Copy} tone="warning" count={selectedIds.size} onConfirm={() => doBulk("duplicate")} disabled={busy} />}
              {canBulk && <BulkConfirm label="Arquivar" icon={Archive} tone="secondary" count={selectedIds.size} onConfirm={() => doBulk("archive")} disabled={busy} />}
              {canDelete && <BulkConfirm label="Excluir" icon={Trash2} tone="destructive" count={selectedIds.size} onConfirm={doBulkDelete} disabled={busy} destructive />}
              {canBulk && <BulkFieldSelect label="Categoria" placeholder="Alterar categoria" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} onPick={(v) => doBulkPatch({ category_id: v }, "Categoria")} disabled={busy} />}
              {canBulk && <BulkFieldSelect label="Perfil" placeholder="Alterar perfil" options={(profiles.data ?? []).map((c) => ({ value: c.id, label: c.name }))} onPick={(v) => doBulkPatch({ profile_id: v }, "Perfil")} disabled={busy} />}
              {canBulk && <BulkFieldSelect label="Banco" placeholder="Alterar banco" options={(banks.data ?? []).map((c) => ({ value: c.id, label: c.name }))} onPick={(v) => doBulkPatch({ bank_id: v }, "Banco")} disabled={busy} />}
              {canBulk && <BulkFieldSelect label="Tipo" placeholder="Alterar tipo" options={Object.entries(transactionTypeLabel).map(([v, l]) => ({ value: v, label: l }))} onPick={(v) => doBulkPatch({ transaction_type: v }, "Tipo")} disabled={busy} />}
            </div>
          </div>
        </div>
      )}

      {/* Compare side-by-side */}
      <CompareDialog receiptId={compareId} onClose={() => setCompareId(null)} onChanged={invalidate} />

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setPreview(EMPTY_PREVIEW); setRejectNote(""); } }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Conferência do comprovante</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
              <div className="rounded-lg border border-border bg-muted/40 p-2">
                <div className="min-h-[520px] overflow-hidden rounded bg-background/50">
                  {preview.loading ? (
                    <div className="grid h-[520px] place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando prévia…</div>
                  ) : preview.url ? (
                    inferMime(editing.file_name, editing.file_mime).startsWith("image/") ? (
                      <ZoomPanFrame>
                        <img src={preview.url} alt="Comprovante" className="block max-w-none rounded" draggable={false} style={{ maxHeight: "none" }} onError={() => setPreview((p) => ({ ...p, error: "A imagem não pôde ser exibida dentro da conferência." }))} />
                      </ZoomPanFrame>
                    ) : inferMime(editing.file_name, editing.file_mime) === "application/pdf" ? (
                      <ZoomPanFrame>
                        <PdfCanvasPreview url={preview.url} fileName={editing.file_name} />
                      </ZoomPanFrame>
                    ) : (
                      <div className="grid h-[520px] place-items-center p-6 text-center text-sm text-muted-foreground">
                        <div><FileText className="mx-auto mb-2 h-8 w-8" /> Este tipo de arquivo deve ser aberto ou baixado para conferência.</div>
                      </div>
                    )
                  ) : (
                    <div className="grid h-[520px] place-items-center p-6 text-center text-sm text-muted-foreground">
                      <div><FileText className="mx-auto mb-2 h-8 w-8" /> {preview.error ?? "Não foi possível carregar a prévia do comprovante."}</div>
                    </div>
                  )}
                </div>
                {preview.error && preview.url && <p className="mt-2 text-xs text-destructive">{preview.error}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {preview.url && <Button asChild variant="outline" size="sm"><a href={preview.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Abrir em nova aba</a></Button>}
                  {preview.downloadUrl && <Button asChild variant="outline" size="sm"><a href={preview.downloadUrl} download={editing.file_name ?? true}><Download className="h-4 w-4" /> Baixar comprovante</a></Button>}
                  <Button variant="outline" size="sm" onClick={analyzeCurrentReceipt} disabled={busy}>
                    <RefreshCw className="h-4 w-4" /> {hasExtractedConferenceData(editing) ? "Reanalisar com IA" : "Analisar comprovante agora"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                {typeof editing.duplicate_score === "number" && editing.duplicate_score >= 50 && (
                  <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${editing.duplicate_score >= 80 ? "border-destructive/50 bg-destructive/10" : "border-yellow-500/50 bg-yellow-500/10"}`}>
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <div className="flex-1">
                      {editing.duplicate_score >= 80 ? "Alta chance de comprovante repetido." : "Possível comprovante repetido."} <span className="opacity-70">(score {editing.duplicate_score}/100)</span>
                    </div>
                    {editing.duplicate_of && <Button size="sm" variant="outline" onClick={() => { setCompareId(editing.id); }}><GitCompareArrows className="h-4 w-4" /> Comparar</Button>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Data</Label><Input type="date" defaultValue={editing.payment_date ?? ""} onBlur={(e) => updateReceipt.mutate({ payment_date: e.target.value || null })} /></div>
                  <div className="space-y-1"><Label>Valor</Label><Input type="number" step="0.01" defaultValue={editing.amount ?? ""} onBlur={(e) => updateReceipt.mutate({ amount: e.target.value ? Number(e.target.value) : null })} /></div>
                </div>
                <div className="space-y-1"><Label>Destinatário</Label><Input defaultValue={editing.recipient_name ?? ""} onBlur={(e) => updateReceipt.mutate({ recipient_name: e.target.value || null })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Banco de origem</Label><Input defaultValue={editing.bank_name ?? ""} onBlur={(e) => updateReceipt.mutate({ bank_name: e.target.value || null })} /></div>
                  <div className="space-y-1"><Label>Código de autenticação</Label><Input defaultValue={editing.auth_code ?? ""} onBlur={(e) => updateReceipt.mutate({ auth_code: e.target.value || null })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Forma de pagamento</Label>
                    <Select defaultValue={editing.payment_method ?? undefined} onValueChange={(v) => updateReceipt.mutate({ payment_method: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{Object.entries(paymentMethodLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <Select defaultValue={editing.transaction_type ?? undefined} onValueChange={(v) => updateReceipt.mutate({ transaction_type: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{Object.entries(transactionTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <Select defaultValue={editing.category_id ?? undefined} onValueChange={(v) => updateReceipt.mutate({ category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex gap-2 pt-1">
                    <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Nova categoria" />
                    <Button type="button" variant="outline" size="icon" onClick={createCategory} disabled={!newCategoryName.trim()} title="Criar categoria"><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-1"><Label>Descrição</Label><Textarea defaultValue={editing.description ?? ""} onBlur={(e) => updateReceipt.mutate({ description: e.target.value || null })} /></div>
                <div className="space-y-1">
                  <Label>Perfil financeiro</Label>
                  <Select defaultValue={editing.profile_id ?? undefined} onValueChange={(v) => updateReceipt.mutate({ profile_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                    <SelectContent>{(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Imóvel vinculado</Label>
                  <Select defaultValue={editing.property_id ?? "none"} onValueChange={(v) => updateReceipt.mutate({ property_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {(properties.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => { setEditing(null); setPreview(EMPTY_PREVIEW); setRejectNote(""); toast.info("Comprovante mantido como pendente. Você pode conferir depois."); }} disabled={busy}>
                    <Inbox className="h-4 w-4" /> Conferir depois
                  </Button>
                  {canApprove && <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline"><XCircle className="h-4 w-4" /> Rejeitar</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rejeitar este comprovante?</AlertDialogTitle>
                        <AlertDialogDescription>Ele não entrará no dashboard nem nos relatórios.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-2 py-2">
                        <Label>Motivo da rejeição</Label>
                        <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Descreva o motivo, se necessário" />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={rejectCurrentReceipt}>Confirmar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>}
                  {canApprove && editing.duplicate_score >= 50 ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="success" disabled={busy}><CheckCircle2 className="h-4 w-4" /> Aprovar</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Possível duplicidade detectada</AlertDialogTitle>
                          <AlertDialogDescription>Este comprovante parece semelhante a outro já salvo. Confirme somente se revisou o arquivo, valor, data, destinatário, banco e código de autenticação.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Voltar</AlertDialogCancel>
                          <AlertDialogAction onClick={approveCurrentReceipt}>Aprovar mesmo assim</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : canApprove ? (
                    <Button variant="success" onClick={approveCurrentReceipt} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Aprovar</Button>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BulkConfirm({ label, icon: Icon, tone, count, onConfirm, disabled, destructive }: { label: string; icon: any; tone: string; count: number; onConfirm: () => void | Promise<void>; disabled?: boolean; destructive?: boolean }) {
  const variant = tone === "success" ? "success" : tone === "destructive" ? "destructive" : tone === "warning" ? "outline" : "secondary";
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant as any} size="sm" disabled={disabled}><Icon className="h-4 w-4" /> {label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{destructive ? "Excluir permanentemente?" : `Confirmar: ${label.toLowerCase()}`}</AlertDialogTitle>
          <AlertDialogDescription>
            Você está prestes a {label.toLowerCase()} {count} comprovante{count > 1 ? "s" : ""}. Deseja continuar?
            {destructive && " Esta ação não pode ser desfeita."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BulkFieldSelect({ label, placeholder, options, onPick, disabled }: { label: string; placeholder: string; options: { value: string; label: string }[]; onPick: (v: string) => void; disabled?: boolean }) {
  const [val, setVal] = useState<string>("");
  const [pending, setPending] = useState<string | null>(null);
  return (
    <>
      <Select value={val} onValueChange={(v) => { setPending(v); }}>
        <SelectTrigger className="h-9 w-[180px] text-xs" disabled={disabled}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar {label.toLowerCase()} em massa?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a alterar {label.toLowerCase()} dos comprovantes selecionados para <strong>{options.find(o => o.value === pending)?.label}</strong>. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pending) { onPick(pending); setVal(""); } setPending(null); }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CompareDialog({ receiptId, onClose, onChanged }: { receiptId: string | null; onClose: () => void; onChanged: () => void }) {
  const approve = useServerFn(approveReceipt);
  const reject = useServerFn(rejectReceipt);
  const bulkAction = useServerFn(bulkReceiptAction);
  const bulkDelete = useServerFn(deleteReceipts);

  const query = useQuery({
    queryKey: ["compare", receiptId],
    enabled: !!receiptId,
    queryFn: async () => {
      const { data: newRec } = await supabase.from("receipts").select("*, categories(name), financial_profiles(name), banks(name)").eq("id", receiptId!).single();
      if (!newRec) return null;
      const { data: oldRec } = newRec.duplicate_of
        ? await supabase.from("receipts").select("*, categories(name), financial_profiles(name), banks(name)").eq("id", newRec.duplicate_of).maybeSingle()
        : { data: null };
      const [newUrl, oldUrl] = await Promise.all([
        newRec.file_path ? supabase.storage.from("receipts").createSignedUrl(newRec.file_path, 600).then(r => r.data?.signedUrl ?? null) : null,
        oldRec?.file_path ? supabase.storage.from("receipts").createSignedUrl(oldRec.file_path, 600).then(r => r.data?.signedUrl ?? null) : null,
      ]);
      return { newRec, oldRec, newUrl, oldUrl };
    },
  });

  const data = query.data;
  const reason = useMemo(() => {
    if (!data?.newRec || !data.oldRec) return "";
    const n = data.newRec, o = data.oldRec;
    if (n.file_hash && o.file_hash && n.file_hash === o.file_hash) return "Este comprovante tem exatamente o mesmo arquivo de outro já salvo.";
    if (n.auth_code && n.auth_code === o.auth_code) return "Este comprovante tem o mesmo código de autenticação de outro comprovante.";
    const sameAmount = Number(n.amount) === Number(o.amount);
    const sameDate = n.payment_date === o.payment_date;
    const sameRecipient = n.recipient_name && o.recipient_name && n.recipient_name.toLowerCase() === o.recipient_name.toLowerCase();
    if (sameAmount && sameDate && sameRecipient) return "Este comprovante parece repetido porque possui o mesmo valor, a mesma data e o mesmo destinatário de um comprovante já salvo.";
    if (sameAmount && sameDate) return "Este comprovante tem o mesmo valor e a mesma data de outro comprovante já salvo.";
    return "Este comprovante tem semelhança alta com outro já salvo. Confira antes de aprovar.";
  }, [data]);

  const run = async (fn: () => Promise<any>, msg: string) => {
    try { await fn(); toast.success(msg); onChanged(); onClose(); } catch (e: any) { toast.error(e.message ?? "Falha"); }
  };

  return (
    <Dialog open={!!receiptId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GitCompareArrows className="h-5 w-5" /> Comparação de duplicidade</DialogTitle>
          <DialogDescription>Confira lado a lado antes de decidir.</DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <div className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar os comprovantes.</p>
        ) : (
          <>
            {reason && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-600" />
                <span>{reason}</span>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <ReceiptPanel title="Comprovante novo" rec={data.newRec} url={data.newUrl} tone="new" />
              {data.oldRec ? (
                <ReceiptPanel title="Comprovante existente" rec={data.oldRec} url={data.oldUrl} tone="old" />
              ) : (
                <Card className="grid place-items-center p-8 text-sm text-muted-foreground">Nenhum comprovante existente vinculado.</Card>
              )}
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => run(() => bulkAction({ data: { receiptIds: [data.newRec.id], action: "approve" } }), "Marcado como novo e aprovado")}>Manter como novo</Button>
              <Button variant="outline" size="sm" onClick={() => run(() => reject({ data: { receiptId: data.newRec.id, reason: "duplicate" } }), "Novo marcado como duplicado")}>Marcar novo como duplicado</Button>
              {data.oldRec && (() => { const oldRec = data.oldRec; return (
                <Button variant="outline" size="sm" onClick={async () => {
                  await bulkDelete({ data: { receiptIds: [oldRec.id] } });
                  await approve({ data: { receiptId: data.newRec.id } });
                  toast.success("Comprovante antigo substituído"); onChanged(); onClose();
                }}>Substituir antigo pelo novo</Button>
              ); })()}
              <Button variant="outline" size="sm" onClick={() => run(() => bulkAction({ data: { receiptIds: [data.newRec.id], action: "archive" } }), "Novo arquivado")}>Arquivar novo</Button>
              <Button variant="destructive" size="sm" onClick={() => run(() => reject({ data: { receiptId: data.newRec.id, reason: "rejected" } }), "Novo rejeitado")}>Rejeitar novo</Button>
              <Button variant="success" size="sm" onClick={() => run(() => approve({ data: { receiptId: data.newRec.id } }), "Novo aprovado mesmo assim")}>Aprovar mesmo assim</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptPanel({ title, rec, url, tone }: { title: string; rec: any; url: string | null; tone: "new" | "old" }) {
  return (
    <Card className={`p-3 ${tone === "new" ? "border-primary/50" : "border-muted"}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {statusBadge(rec.status)}
      </div>
      <div className="mb-3 h-64 overflow-hidden rounded border border-border bg-muted/40">
        {url ? (
          rec.file_mime?.startsWith("image/")
            ? <img src={url} alt={title} className="h-full w-full object-contain" />
            : <iframe src={url} title={title} className="h-full w-full" />
        ) : <div className="grid h-full place-items-center text-xs text-muted-foreground">Sem prévia</div>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Valor</dt><dd className="font-medium">{currencyBRL(Number(rec.amount ?? 0))}</dd>
        <dt className="text-muted-foreground">Data</dt><dd>{dateBR(rec.payment_date)}</dd>
        <dt className="text-muted-foreground">Destinatário</dt><dd className="truncate">{rec.recipient_name ?? "—"}</dd>
        <dt className="text-muted-foreground">Banco</dt><dd>{rec.banks?.name ?? rec.bank_name ?? "—"}</dd>
        <dt className="text-muted-foreground">Cód. autenticação</dt><dd className="truncate">{rec.auth_code ?? "—"}</dd>
        <dt className="text-muted-foreground">Categoria</dt><dd>{rec.categories?.name ?? "—"}</dd>
        <dt className="text-muted-foreground">Perfil</dt><dd>{rec.financial_profiles?.name ?? "—"}</dd>
        <dt className="text-muted-foreground">Tipo</dt><dd>{rec.transaction_type ? transactionTypeLabel[rec.transaction_type as keyof typeof transactionTypeLabel] : "—"}</dd>
      </dl>
    </Card>
  );
}