import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { centsToNumber, currencyBRL, dateBR, parseBrlAmountToCents, paymentMethodLabel, transactionTypeLabel } from "@/lib/format";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ExternalLink,
  FileText,
  Loader2,
  Inbox,
  Copy,
  Archive,
  Trash2,
  GitCompareArrows,
  Download,
  Plus,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FilterX,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  approveReceipt,
  rejectReceipt,
  bulkReceiptAction,
  bulkUpdateReceipts,
  deleteReceipts,
  analyzeReceipt,
  updateReceiptConference,
  archiveReceipt,
  mergeReceipts,
  markAsNotDuplicate,
} from "@/lib/receipts.functions";
import { generateFixedVariableReport } from "@/lib/report-templates";
import { loadReportDataset, MONTH_NAMES } from "@/lib/report-data";

import { useCan } from "@/lib/permissions";
import { z } from "zod";
import { ConferenceDialog } from "@/components/vault/conference-dialog";
import { MultiSelect } from "@/components/ui/multi-select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/vault")({
  head: () => ({ meta: [{ title: "Cofre de comprovantes — Meu Cofre" }] }),
  validateSearch: (s) => z.object({ 
    receipt: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    expenseBehavior: z.string().optional(),
    transactionType: z.string().optional(),
    month: z.string().optional(),
  }).parse(s),
  component: VaultPage,
});

type QuickFilter =
  | "all"
  | "pending"
  | "suspected"
  | "high_dup"
  | "approved"
  | "rejected"
  | "archived";

type PreviewState = {
  loading: boolean;
  url: string | null;
  downloadUrl: string | null;
  error: string | null;
  isObjectUrl?: boolean;
};

const EMPTY_PREVIEW: PreviewState = {
  loading: false,
  url: null,
  downloadUrl: null,
  error: null,
  isObjectUrl: false,
};

function stripAccents(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
  return centsToNumber(parseBrlAmountToCents(value));
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
    if (aliases.some((alias) => normalized === stripAccents(alias).replace(/[\s_-]+/g, "")))
      return record[key];
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
  const amount =
    receipt.amount != null ? `no valor de ${currencyBRL(Number(receipt.amount))}` : null;
  const date = receipt.payment_date ? `realizado em ${dateBR(receipt.payment_date)}` : null;
  const by = receipt.bank_name
    ? `pelo banco ${receipt.bank_name}`
    : receipt.payment_method
      ? `via ${paymentMethodLabel[receipt.payment_method as keyof typeof paymentMethodLabel] ?? receipt.payment_method}`
      : null;
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
  hydrated.payment_date =
    hydrated.payment_date ??
    normalizeDateValue(deepFind(ocr, ["payment_date", "data_pagamento", "data", "detected_date"]));
  hydrated.amount =
    hydrated.amount ??
    normalizeAmountValue(deepFind(ocr, ["amount", "valor", "valor_pago", "detected_amount"]));
  hydrated.recipient_name =
    hydrated.recipient_name ??
    firstText(
      deepFind(ocr, [
        "recipient_name",
        "beneficiario",
        "favorecido",
        "destinatario",
        "payee",
        "detected_payee",
      ]),
    );
  hydrated.recipient_tax_id =
    hydrated.recipient_tax_id ??
    firstText(deepFind(ocr, ["recipient_tax_id", "cpf_cnpj", "documento"]));
  hydrated.bank_name =
    hydrated.bank_name ??
    firstText(deepFind(ocr, ["bank_name", "banco", "banco_origem", "detected_bank"]));
  hydrated.auth_code =
    hydrated.auth_code ??
    firstText(
      deepFind(ocr, ["auth_code", "codigo_autenticacao", "autenticacao", "id_transacao", "e2e"]),
    );
  hydrated.payment_method =
    hydrated.payment_method ??
    normalizePaymentValue(deepFind(ocr, ["payment_method", "forma_pagamento", "metodo_pagamento"]));
  hydrated.transaction_type =
    hydrated.transaction_type ??
    normalizeTransactionValue(deepFind(ocr, ["transaction_type", "tipo_transacao", "tipo"]));
  hydrated.description =
    hydrated.description ?? firstText(deepFind(ocr, ["description", "descricao", "historico"]));

  const suggestedCategory = firstText(
    deepFind(ocr, ["suggested_category", "categoria_sugerida", "categoria", "category"]),
  );
  if (!hydrated.category_id && suggestedCategory) {
    hydrated.category_id =
      categories.find((c) => stripAccents(c.name) === stripAccents(suggestedCategory))?.id ?? null;
  }
  const suggestedProperty = firstText(
    deepFind(ocr, ["property", "imovel", "imovel_vinculado", "property_name"]),
  );
  if (!hydrated.property_id && suggestedProperty) {
    hydrated.property_id =
      properties.find((p) => stripAccents(p.name) === stripAccents(suggestedProperty))?.id ?? null;
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

function hasExtractedConferenceData(receipt: any) {
  return Boolean(
    receipt.payment_date ||
    receipt.amount != null ||
    receipt.recipient_name ||
    receipt.bank_name ||
    receipt.auth_code ||
    receipt.payment_method ||
    receipt.transaction_type ||
    receipt.category_id,
  );
}

function statusBadge(s: string) {
  if (s === "approved")
    return <Badge className="bg-success text-success-foreground hover:bg-success">Aprovado</Badge>;
  if (s === "duplicate")
    return <Badge className="bg-orange-500 text-white hover:bg-orange-500">Duplicado</Badge>;
  if (s === "rejected") return <Badge variant="destructive">Rejeitado</Badge>;
  if (s === "archived")
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        Arquivado
      </Badge>
    );
  return <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">Pendente</Badge>;
}

function dupScoreBadge(score: number | null | undefined) {
  const s = Number(score ?? 0);
  if (s >= 80)
    return (
      <Badge className="gap-1 bg-destructive text-destructive-foreground hover:bg-destructive">
        <AlertTriangle className="h-3 w-3" /> Alta {s}
      </Badge>
    );
  if (s >= 50)
    return (
      <Badge className="gap-1 bg-yellow-500 text-white hover:bg-yellow-500">
        <AlertTriangle className="h-3 w-3" /> Possível {s}
      </Badge>
    );
  return <span className="text-xs text-muted-foreground">—</span>;
}

function VaultPage() {
  const PAGE_SIZE = 50;
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const approve = useServerFn(approveReceipt);
  const reject = useServerFn(rejectReceipt);
  const analyze = useServerFn(analyzeReceipt);
  const saveConference = useServerFn(updateReceiptConference);
  const bulkAction = useServerFn(bulkReceiptAction);
  const bulkUpdate = useServerFn(bulkUpdateReceipts);
  const bulkDelete = useServerFn(deleteReceipts);
  const archive = useServerFn(archiveReceipt);
  const merge = useServerFn(mergeReceipts);
  const markNotDuplicate = useServerFn(markAsNotDuplicate);

  const canApprove = useCan("approveReceipts");
  const canBulk = useCan("bulkActions");
  const canDelete = useCan("deleteData");

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(0);
  const [quick, setQuick] = useState<QuickFilter>("pending");
  const [profileId, setProfileId] = useState<string>("all");
  const [bankId, setBankId] = useState<string>("all");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<any | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [suggested, setSuggested] = useState<any | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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

  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: async () =>
      (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [],
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () =>
      (await supabase.from("categories").select("id, name").order("name")).data ?? [],
  });
  const properties = useQuery({
    queryKey: ["properties", "conference"],
    queryFn: async () =>
      (await supabase.from("properties").select("id, name, profile_id").order("name")).data ?? [],
  });
  const accounts = useQuery({
    queryKey: ["accounts", "conference"],
    queryFn: async () =>
      (
        await supabase
          .from("accounts")
          .select("id, nickname, bank_id, profile_id")
          .order("nickname")
      ).data ?? [],
  });
  const banks = useQuery({
    queryKey: ["banks"],
    queryFn: async () => (await supabase.from("banks").select("id, name").order("name")).data ?? [],
  });

  // Busca é aplicada no servidor (com debounce) para não depender de um teto de linhas.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const receipts = useQuery({
    queryKey: ["receipts", quick, profileId, bankId, selectedCategoryIds, debouncedQ, incompleteOnly, page, search.from, search.to, search.expenseBehavior, search.transactionType],
    queryFn: async () => {
      let qb = supabase
        .from("receipts")
        .select("*", { count: "exact" })
        .order("payment_date", { ascending: false })
        .order("id", { ascending: true });
      
      if (quick === "pending") qb = qb.in("status", ["pending", "duplicate"]).or(`ocr_status.eq.failed,status.eq.pending`);
      else if (quick === "approved") qb = qb.eq("status", "approved");
      else if (quick === "rejected") qb = qb.eq("status", "rejected");
      else if (quick === "archived") qb = qb.eq("status", "archived");
      else if (quick === "suspected") qb = qb.gte("duplicate_score", 50);
      else if (quick === "high_dup") qb = qb.gte("duplicate_score", 80);

      // Filtro de informações incompletas (Aprovados sem categoria ou sem perfil)
      if (incompleteOnly) {
        qb = qb.or("category_id.is.null,profile_id.is.null");
      }

      if (search.from) qb = qb.gte("payment_date", search.from);
      if (search.to) qb = qb.lte("payment_date", search.to);
      if (search.expenseBehavior && search.expenseBehavior !== "all") {
        if (search.expenseBehavior === "null") {
          qb = qb.is("expense_behavior", null);
        } else {
          qb = qb.eq("expense_behavior", search.expenseBehavior);
        }
      }
      if (search.transactionType && search.transactionType !== "all") {
        qb = qb.eq("transaction_type", search.transactionType as any);
      }

      if (profileId === "__none__") {
        qb = qb.is("profile_id", null);
      } else if (profileId !== "all") {
        qb = qb.eq("profile_id", profileId);
      }

      if (bankId !== "all") qb = qb.eq("bank_id", bankId);
      
      if (selectedCategoryIds.length > 0) {
        const hasNone = selectedCategoryIds.includes("__none__");
        const ids = selectedCategoryIds.filter(id => id !== "__none__");
        
        if (hasNone && ids.length > 0) {
          qb = qb.or(`category_id.in.(${ids.join(",")}),category_id.is.null`);
        } else if (hasNone) {
          qb = qb.is("category_id", null);
        } else {
          qb = qb.in("category_id", ids);
        }
      }

      if (debouncedQ) {
        const safe = debouncedQ.replace(/[%,()]/g, " ").trim();
        if (safe) {
          const like = `%${safe}%`;
          const orParts = [
            `recipient_name.ilike.${like}`,
            `description.ilike.${like}`,
            `bank_name.ilike.${like}`,
            `auth_code.ilike.${like}`,
            `file_name.ilike.${like}`,
          ];
          const numeric = centsToNumber(parseBrlAmountToCents(safe));
          if (numeric !== null && Number.isFinite(numeric) && safe.replace(/[^0-9]/g, "").length > 0) {
            orParts.push(`amount.eq.${numeric}`);
          }
          qb = qb.or(orParts.join(","));
        }
      }
      const from = page * PAGE_SIZE;
      const { data, error, count } = await qb.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as any[], total: count ?? 0 };
    },
  });

  useEffect(() => {
    setSelectedIds(new Set());
    setPage(0);
  }, [quick, profileId, bankId, selectedCategoryIds, debouncedQ, incompleteOnly]);

  const profileIdToName = new Map<string, string>((profiles.data ?? []).map((p: any) => [p.id, p.name]));
  const filtered = receipts.data?.rows ?? [];
  const total = receipts.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allSelected = filtered.length > 0 && filtered.every((r: any) => selectedIds.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r: any) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
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
      setSelectedIds(new Set());
      invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Falha na ação");
    } finally {
      setBusy(false);
    }
  };

  const doBulkPatch = async (patch: any, label: string) => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const res = await bulkUpdate({ data: { receiptIds: Array.from(selectedIds), patch } });
      toast.success(`${label} aplicado a ${res.count} comprovante(s)`);
      invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Falha");
    } finally {
      setBusy(false);
    }
  };

  const doBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const res = await bulkDelete({ data: { receiptIds: Array.from(selectedIds) } });
      if (res.storageWarning) {
        toast.warning(
          `${res.count} lançamento(s) excluídos, mas o arquivo não pôde ser removido do armazenamento.`,
          {
            description:
              "O registro já não existe mais. Tente remover o arquivo novamente mais tarde.",
          },
        );
      } else {
        toast.success(
          `${res.count} lançamento(s) excluídos` +
            (res.filesRemoved ? ` · ${res.filesRemoved} arquivo(s) apagados` : "") +
            (res.filesKept ? ` · ${res.filesKept} arquivo(s) preservados (em uso)` : ""),
        );
      }
      setSelectedIds(new Set());
      invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Falha");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = async (r: any) => {
    // Somente leitura: abrir o modal não altera dados do comprovante.
    setOriginal(r);
    setDraft({ ...r });
    setSuggested(hydrateReceiptForConference(r, categories.data ?? [], properties.data ?? []));
    setRejectNote("");
    setNewCategoryName("");
    setPreview({ ...EMPTY_PREVIEW, loading: true });

    const path = getStoragePath(r);
    if (!path) {
      setPreview({
        loading: false,
        url: null,
        downloadUrl: null,
        error: "Este comprovante não tem caminho de arquivo salvo.",
      });
      return;
    }
    const [{ data, error }, downloadResult, downloaded] = await Promise.all([
      supabase.storage.from("receipts").createSignedUrl(path, 60 * 10),
      (supabase.storage.from("receipts") as any).createSignedUrl(path, 60 * 10, {
        download: r.file_name ?? true,
      }),
      supabase.storage.from("receipts").download(path),
    ]);
    if (downloaded.error || !downloaded.data) {
      setPreview({
        loading: false,
        url: null,
        downloadUrl: null,
        error: `Arquivo não encontrado no bucket receipts para o caminho: ${path}`,
        isObjectUrl: false,
      });
      return;
    }
    const objectUrl = URL.createObjectURL(downloaded.data);
    if (error || !data?.signedUrl) {
      setPreview({
        loading: false,
        url: objectUrl,
        downloadUrl: objectUrl,
        error: error?.message ?? null,
        isObjectUrl: true,
      });
      return;
    }
    setPreview({
      loading: false,
      url: objectUrl,
      downloadUrl: downloadResult?.data?.signedUrl ?? data.signedUrl,
      error: null,
      isObjectUrl: true,
    });
  };

  // Deep-link: open a specific receipt's review dialog via ?receipt=<id>
  useEffect(() => {
    const id = search.receipt;
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("*")
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.receipt]);

  const CONFERENCE_FIELDS = [
    "payment_date",
    "amount",
    "recipient_name",
    "recipient_tax_id",
    "bank_name",
    "auth_code",
    "payment_method",
    "transaction_type",
    "expense_behavior",
    "category_id",
    "description",
    "notes",
    "profile_id",
    "property_id",
    "bank_id",
    "account_id",
  ] as const;
  type ConfField = (typeof CONFERENCE_FIELDS)[number];

  const isDirty = useMemo(() => {
    if (!original || !draft) return false;
    return CONFERENCE_FIELDS.some((k) => {
      const a = (original as any)[k] ?? null;
      const b = (draft as any)[k] ?? null;
      return a !== b;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, draft]);

  const setDraftField = (field: ConfField, value: any) => {
    setDraft((current: any) => (current ? { ...current, [field]: value } : current));
  };

  const patchDraft = (patch: Record<string, unknown>) => {
    setDraft((current: any) => (current ? { ...current, ...patch } : current));
  };

  const discardDraft = () => {
    if (!original) return;
    setDraft({ ...original });
    toast.info("Alterações descartadas. Nada foi salvo.");
  };

  const applySuggestion = (field: ConfField) => {
    if (!suggested) return;
    const val = (suggested as any)[field];
    if (val == null || val === "") return;
    setDraftField(field, val);
  };

  const closeEditing = () => {
    setOriginal(null);
    setDraft(null);
    setSuggested(null);
    setPreview(EMPTY_PREVIEW);
    setRejectNote("");
    setNewCategoryName("");
  };

  const requestClose = () => {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      closeEditing();
      toast.info(
        "Nenhuma alteração foi salva. O comprovante continuará disponível para conferência.",
      );
    }
  };

  const saveDraft = async () => {
    if (!original || !draft || !isDirty) return;
    setBusy(true);
    try {
      const patch: Record<string, any> = {};
      for (const k of CONFERENCE_FIELDS) {
        const a = (original as any)[k] ?? null;
        const b = (draft as any)[k] ?? null;
        if (a !== b) patch[k] = b;
      }
      const res: any = await saveConference({ data: { receiptId: original.id, patch } });
      if (!res?.ok || !res.receipt) throw new Error("Não foi possível salvar as alterações");
      const merged = { ...original, ...res.receipt };
      setOriginal(merged);
      setDraft({ ...merged });
      toast.success("Alterações salvas com sucesso.");
      await invalidate();
      await qc.invalidateQueries({ queryKey: ["report"] });
      await qc.invalidateQueries({ queryKey: ["reports"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar alterações");
    } finally {
      setBusy(false);
    }
  };

  const createCategoryByName = async (name: string, type: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast.error("Sessão expirada");
      return null;
    }
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name, default_type: type as any })
      .select("id, name")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível criar a categoria");
      return null;
    }
    await qc.invalidateQueries({ queryKey: ["categories"] });
    patchDraft({ category_id: data.id });
    toast.success("Categoria criada. Clique em Salvar alterações para vincular ao comprovante.");
    return data.id;
  };

  const analyzeCurrentReceipt = async () => {
    if (!original) return;
    if (isDirty) {
      toast.error("Salve ou descarte as alterações antes de reanalisar.");
      return;
    }
    setBusy(true);
    try {
      const res = await analyze({ data: { receiptId: original.id } });
      if (!res.ok) throw new Error(res.error ?? "Não foi possível analisar o comprovante");
      const { data } = await supabase
        .from("receipts")
        .select("*")
        .eq("id", original.id)
        .single();
      if (data) await openEdit(data);
      invalidate();
      toast.success("Comprovante analisado");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao analisar");
    } finally {
      setBusy(false);
    }
  };

  // Após aprovar/rejeitar, abre automaticamente o próximo comprovante pendente.
  const goToNextPending = async (currentId: string) => {
    let qb = supabase
      .from("receipts")
      .select("*")
      .eq("status", "pending")
      .neq("id", currentId)
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (profileId === "__none__") {
      qb = qb.is("profile_id", null);
    } else if (profileId !== "all") {
      qb = qb.eq("profile_id", profileId);
    }
    
    if (bankId !== "all") qb = qb.eq("bank_id", bankId);
    
    if (selectedCategoryIds.length > 0) {
      const hasNone = selectedCategoryIds.includes("__none__");
      const ids = selectedCategoryIds.filter(id => id !== "__none__");
      
      if (hasNone && ids.length > 0) {
        qb = qb.or(`category_id.in.(${ids.join(",")}),category_id.is.null`);
      } else if (hasNone) {
        qb = qb.is("category_id", null);
      } else {
        qb = qb.in("category_id", ids);
      }
    }

    const { data, error } = await qb.maybeSingle();
    if (error || !data) {
      closeEditing();
      if (!error) toast.info("Nenhum comprovante pendente restante.");
      return;
    }
    await openEdit(data);
  };

  const approveCurrentReceipt = async () => {
    if (!original) return;
    if (isDirty) {
      toast.error("Salve ou descarte as alterações antes de aprovar.");
      return;
    }
    setBusy(true);
    try {
      await approve({ data: { receiptId: original.id } });
      toast.success("Aprovado");
      invalidate();
      await goToNextPending(original.id);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao aprovar");
    } finally {
      setBusy(false);
    }
  };

  const rejectCurrentReceipt = async (note?: string) => {
    if (!original) return;
    setBusy(true);
    try {
      await reject({
        data: {
          receiptId: original.id,
          reason: "rejected",
          note: (note ?? rejectNote) || undefined,
        },
      });
      toast.success("Comprovante rejeitado");
      invalidate();
      await goToNextPending(original.id);
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
        <p className="text-sm text-muted-foreground">
          Conferência em lote, comparação de duplicados e organização.
        </p>
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
        
        {quick === "approved" && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button 
              variant={!incompleteOnly && selectedCategoryIds.length === 0 && profileId === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIncompleteOnly(false);
                setSelectedCategoryIds([]);
                setProfileId("all");
              }}
            >
              Todos os aprovados
            </Button>
            <Button 
              variant={!incompleteOnly && selectedCategoryIds.length === 1 && selectedCategoryIds.includes("__none__") ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIncompleteOnly(false);
                setSelectedCategoryIds(["__none__"]);
                setProfileId("all");
              }}
            >
              Aprovados sem categoria
            </Button>
            <Button 
              variant={!incompleteOnly && profileId === "__none__" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIncompleteOnly(false);
                setSelectedCategoryIds([]);
                setProfileId("__none__");
              }}
            >
              Aprovados sem perfil
            </Button>
            <Button 
              variant={incompleteOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIncompleteOnly(true);
                setSelectedCategoryIds([]);
                setProfileId("all");
              }}
            >
              Aprovados incompletos
            </Button>
          </div>
        )}
      </Tabs>

      <Card className="p-4 shadow-sm border-border/50">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por destinatário, valor, descrição, banco…"
                className="pl-9"
              />
            </div>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                <SelectItem value="__none__">Sem perfil definido</SelectItem>
                {(profiles.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger>
                <SelectValue placeholder="Banco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os bancos</SelectItem>
                {(banks.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Categoria</Label>
              <MultiSelect
                options={[
                  { label: "Sem categoria", value: "__none__" },
                  ...(categories.data ?? []).map((c) => ({ label: c.name, value: c.id })),
                ]}
                selected={selectedCategoryIds}
                onChange={setSelectedCategoryIds}
                placeholder="Todas as categorias"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Mês</Label>
              <Select 
                value={search.month || "all"} 
                onValueChange={(v) => {
                  if (v === "all") {
                    navigate({ search: { ...search, month: undefined, from: undefined, to: undefined }, replace: true });
                  } else {
                    const [year, month] = v.split("-").map(Number);
                    const start = new Date(year, month - 1, 1);
                    const end = new Date(year, month, 0);
                    const fromStr = `${year}-${String(month).padStart(2, "0")}-01`;
                    const toStr = `${year}-${String(month).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
                    navigate({ search: { ...search, month: v, from: fromStr, to: toStr }, replace: true });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os meses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  {(() => {
                    const months = [];
                    const now = new Date();
                    // Show last 24 months
                    for (let i = 0; i < 24; i++) {
                      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                      const label = `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`;
                      months.push(<SelectItem key={val} value={val}>{label}</SelectItem>);
                    }
                    return months;
                  })()}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Tipo de Gasto</Label>
              <Select 
                value={search.expenseBehavior || "all"} 
                onValueChange={(v) => navigate({ search: { ...search, expenseBehavior: v === "all" ? undefined : v }, replace: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="fixed">Fixo</SelectItem>
                  <SelectItem value="variable">Variável</SelectItem>
                  <SelectItem value="null">Não definido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Natureza</Label>
              <Select 
                value={search.transactionType || "all"} 
                onValueChange={(v) => navigate({ search: { ...search, transactionType: v === "all" ? undefined : v }, replace: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="investimento">Investimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="grid grid-cols-2 gap-2 w-full md:w-auto">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">De</Label>
                <Input 
                  type="date" 
                  value={search.from || ""} 
                  onChange={(e) => navigate({ search: { ...search, from: e.target.value || undefined, month: undefined }, replace: true })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Até</Label>
                <Input 
                  type="date" 
                  value={search.to || ""} 
                  onChange={(e) => navigate({ search: { ...search, to: e.target.value || undefined, month: undefined }, replace: true })}
                  className="h-9"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mt-auto">
              <Button
                variant={incompleteOnly ? "secondary" : "ghost"}
                size="sm"
                className={cn("gap-2", incompleteOnly && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400")}
                onClick={() => setIncompleteOnly(!incompleteOnly)}
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">Incompletos</span>
              </Button>
              
              {(q || profileId !== "all" || bankId !== "all" || selectedCategoryIds.length > 0 || incompleteOnly || search.from || search.to || search.expenseBehavior || search.transactionType) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={() => {
                    setQ("");
                    setProfileId("all");
                    setBankId("all");
                    setSelectedCategoryIds([]);
                    setIncompleteOnly(false);
                    navigate({ search: { receipt: search.receipt }, replace: true });
                  }}
                >
                  <FilterX className="h-4 w-4" />
                  Limpar filtros
                </Button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-2 ml-auto bg-navy text-white hover:bg-navy/90"
              onClick={async () => {
                const data = await loadReportDataset({
                  from: search.from || "2026-01-01",
                  to: search.to || "2026-07-31",
                  profileId: (profileId !== "all" && profileId !== "__none__" && profileId) ? profileId : "",
                });
                await generateFixedVariableReport(data);
                toast.success("Relatório gerado com sucesso!");
              }}
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Gerar Relatório</span>
            </Button>
          </div>
        </div>
      </Card>

      {receipts.isLoading ? (
        <Card className="p-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : receipts.isError ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium">Não foi possível carregar os comprovantes</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {(receipts.error as any)?.message ?? "Erro inesperado ao consultar o Cofre."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => receipts.refetch()}>
            Tentar novamente
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Inbox className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">Nenhum comprovante encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajuste os filtros ou envie novos comprovantes.
          </p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
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
                    const highlight =
                      r.duplicate_score >= 80
                        ? "bg-destructive/5"
                        : r.duplicate_score >= 50
                          ? "bg-yellow-500/5"
                          : "";
                    return (
                      <TableRow
                        key={r.id}
                        className={`${highlight} cursor-pointer`}
                        onClick={() => openEdit(r)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={checked} onCheckedChange={() => toggleOne(r.id)} />
                        </TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {dateBR(r.payment_date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm font-semibold">
                          {currencyBRL(Number(r.amount ?? 0))}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm">
                          {r.recipient_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {banks.data?.find((b: any) => b.id === r.bank_id)?.name ?? r.bank_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {profileIdToName.get(r.profile_id) ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{categories.data?.find((c: any) => c.id === r.category_id)?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.transaction_type
                            ? transactionTypeLabel[
                                r.transaction_type as keyof typeof transactionTypeLabel
                              ]
                            : "—"}
                        </TableCell>
                        <TableCell>{dupScoreBadge(r.duplicate_score)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {dateBR(r.created_at)}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {r.duplicate_of && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCompareId(r.id)}
                                title="Comparar duplicado"
                              >
                                <GitCompareArrows className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                              Editar
                            </Button>
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
              const highlight =
                r.duplicate_score >= 80
                  ? "border-destructive/50"
                  : r.duplicate_score >= 50
                    ? "border-yellow-500/50"
                    : "";
              return (
                <Card key={r.id} className={`p-3 ${highlight}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleOne(r.id)}
                      className="mt-1"
                    />
                    <button onClick={() => openEdit(r)} className="flex-1 min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {r.recipient_name || r.description || "Comprovante"}
                        </p>
                        {statusBadge(r.status)}
                        {dupScoreBadge(r.duplicate_score)}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {dateBR(r.payment_date)} • {banks.data?.find((b: any) => b.id === r.bank_id)?.name ?? r.bank_name ?? "—"} •{" "}
                        {profileIdToName.get(r.profile_id) ?? "sem perfil"} •{" "}
                        {categories.data?.find((c: any) => c.id === r.category_id)?.name ?? "sem categoria"}
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {currencyBRL(Number(r.amount ?? 0))}
                      </p>
                    </button>
                    {r.duplicate_of && (
                      <Button variant="ghost" size="icon" onClick={() => setCompareId(r.id)}>
                        <GitCompareArrows className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Paginação servidor */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <p className="text-xs text-muted-foreground">
              {total} comprovante(s) • página {page + 1} de {totalPages}
              {receipts.isFetching && " • atualizando…"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || receipts.isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages || receipts.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Sticky bulk toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur md:left-64">
          <div className="mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{selectedIds.size} selecionado(s)</Badge>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Limpar
              </Button>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            <div className="flex flex-wrap gap-2">
              {canApprove && (
                <BulkConfirm
                  label="Aprovar"
                  icon={CheckCircle2}
                  tone="success"
                  count={selectedIds.size}
                  onConfirm={() => doBulk("approve")}
                  disabled={busy}
                />
              )}
              {canApprove && (
                <BulkConfirm
                  label="Rejeitar"
                  icon={XCircle}
                  tone="destructive"
                  count={selectedIds.size}
                  onConfirm={() => doBulk("reject")}
                  disabled={busy}
                />
              )}
              {canApprove && (
                <BulkConfirm
                  label="Marcar duplicado"
                  icon={Copy}
                  tone="warning"
                  count={selectedIds.size}
                  onConfirm={() => doBulk("duplicate")}
                  disabled={busy}
                />
              )}
              {canBulk && (
                <BulkConfirm
                  label="Arquivar"
                  icon={Archive}
                  tone="secondary"
                  count={selectedIds.size}
                  onConfirm={() => doBulk("archive")}
                  disabled={busy}
                />
              )}
              {canDelete && (
                <BulkConfirm
                  label="Excluir"
                  icon={Trash2}
                  tone="destructive"
                  count={selectedIds.size}
                  onConfirm={doBulkDelete}
                  disabled={busy}
                  destructive
                />
              )}
              {canBulk && (
                <BulkFieldSelect
                  label="Categoria"
                  placeholder="Alterar categoria"
                  options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  onPick={(v) => doBulkPatch({ category_id: v }, "Categoria")}
                  disabled={busy}
                />
              )}
              {canBulk && (
                <BulkFieldSelect
                  label="Perfil"
                  placeholder="Alterar perfil"
                  options={(profiles.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  onPick={(v) => doBulkPatch({ profile_id: v }, "Perfil")}
                  disabled={busy}
                />
              )}
              {canBulk && (
                <BulkFieldSelect
                  label="Banco"
                  placeholder="Alterar banco"
                  options={(banks.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  onPick={(v) => doBulkPatch({ bank_id: v }, "Banco")}
                  disabled={busy}
                />
              )}
              {canBulk && (
                <BulkFieldSelect
                  label="Tipo"
                  placeholder="Alterar tipo"
                  options={Object.entries(transactionTypeLabel).map(([v, l]) => ({
                    value: v,
                    label: l,
                  }))}
                  onPick={(v) => doBulkPatch({ transaction_type: v }, "Tipo")}
                  disabled={busy}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compare side-by-side */}
      <CompareDialog
        receiptId={compareId}
        onClose={() => setCompareId(null)}
        onChanged={invalidate}
      />

      {/* Área de conferência ampla */}
      {original && draft && (
        <ConferenceDialog
          original={original}
          draft={draft}
          suggested={suggested}
          isDirty={isDirty}
          busy={busy}
          canApprove={canApprove}
          preview={preview}
          statusBadge={statusBadge}
          categories={categories.data ?? []}
          profiles={profiles.data ?? []}
          properties={properties.data ?? []}
          banks={banks.data ?? []}
          accounts={accounts.data ?? []}
          hasExtractedData={hasExtractedConferenceData(original)}
          patchDraft={patchDraft}
          applySuggestion={applySuggestion}
          onRequestClose={requestClose}
          onDiscard={discardDraft}
          onSave={saveDraft}
          onApprove={approveCurrentReceipt}
          onReject={(note) => {
            setRejectNote(note);
            void rejectCurrentReceipt(note);
          }}
          onArchive={async () => {
            if (!original) return;
            setBusy(true);
            try {
              await archive({ data: { receiptId: original.id } });
              toast.success("Comprovante arquivado com sucesso.");
              invalidate();
              setOriginal(null);
              setDraft(null);
              setSuggested(null);
              goToNextPending(original.id);
            } catch (e: any) {
              toast.error(e.message || "Não foi possível arquivar o comprovante. Tente novamente.");
            } finally {
              setBusy(false);
            }
          }}
          onAnalyze={analyzeCurrentReceipt}
          onCompare={() => setCompareId(original.id)}
          onPreviewError={(message) => setPreview((prev) => ({ ...prev, error: message }))}

          onCreateCategory={createCategoryByName}
        />
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações não salvas?</AlertDialogTitle>
            <AlertDialogDescription>
              Suas alterações no comprovante não serão salvas. O comprovante continuará disponível
              para conferência.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                closeEditing();
                toast.info(
                  "Nenhuma alteração foi salva. O comprovante continuará disponível para conferência.",
                );
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BulkConfirm({
  label,
  icon: Icon,
  tone,
  count,
  onConfirm,
  disabled,
  destructive,
}: {
  label: string;
  icon: any;
  tone: string;
  count: number;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const variant =
    tone === "success"
      ? "success"
      : tone === "destructive"
        ? "destructive"
        : tone === "warning"
          ? "outline"
          : "secondary";
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant as any} size="sm" disabled={disabled}>
          <Icon className="h-4 w-4" /> {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {destructive ? "Excluir permanentemente?" : `Confirmar: ${label.toLowerCase()}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Você está prestes a {label.toLowerCase()} {count} comprovante{count > 1 ? "s" : ""}.
            Deseja continuar?
            {destructive &&
              " O lançamento será apagado do banco de dados e o arquivo original será removido do armazenamento apenas se nenhum outro lançamento ou importação estiver usando o mesmo arquivo. Esta ação não pode ser desfeita."}
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

function BulkFieldSelect({
  label,
  placeholder,
  options,
  onPick,
  disabled,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onPick: (v: string) => void;
  disabled?: boolean;
}) {
  const [val, setVal] = useState<string>("");
  const [pending, setPending] = useState<string | null>(null);
  return (
    <>
      <Select
        value={val}
        onValueChange={(v) => {
          setPending(v);
        }}
      >
        <SelectTrigger className="h-9 w-[180px] text-xs" disabled={disabled}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar {label.toLowerCase()} em massa?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a alterar {label.toLowerCase()} dos comprovantes selecionados para{" "}
              <strong>{options.find((o) => o.value === pending)?.label}</strong>. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) {
                  onPick(pending);
                  setVal("");
                }
                setPending(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CompareDialog({
  receiptId,
  onClose,
  onChanged,
}: {
  receiptId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const approve = useServerFn(approveReceipt);
  const reject = useServerFn(rejectReceipt);
  const bulkAction = useServerFn(bulkReceiptAction);
  const bulkDelete = useServerFn(deleteReceipts);

  const query = useQuery({
    queryKey: ["compare", receiptId],
    enabled: !!receiptId,
    queryFn: async () => {
      const { data: newRec } = await supabase
        .from("receipts")
        .select("*, category:categories(name), financial_profiles(name), banks(name)")
        .eq("id", receiptId!)
        .single();
      if (!newRec) return null;

      const { data: oldRec } = newRec.duplicate_of
        ? await supabase
            .from("receipts")
            .select("*, category:categories(name), financial_profiles(name), banks(name)")
            .eq("id", newRec.duplicate_of)
            .maybeSingle()
        : { data: null };

      const { data: check } = await supabase
        .from("duplicate_checks")
        .select("*")
        .eq("new_receipt_id", newRec.id)
        .eq("candidate_receipt_id", oldRec?.id ?? "")
        .maybeSingle();

      const [newUrl, oldUrl] = await Promise.all([
        newRec.file_path
          ? supabase.storage
              .from("receipts")
              .createSignedUrl(newRec.file_path, 600)
              .then((r) => r.data?.signedUrl ?? null)
          : null,
        oldRec?.file_path
          ? supabase.storage
              .from("receipts")
              .createSignedUrl(oldRec.file_path, 600)
              .then((r) => r.data?.signedUrl ?? null)
          : null,
      ]);
      return { newRec, oldRec, newUrl, oldUrl, check };
    },
  });

  const data = query.data;
  const reason = useMemo(() => {
    if (!data?.newRec || !data.oldRec) return "";
    const n = data.newRec,
      o = data.oldRec;
    if (n.file_hash && o.file_hash && n.file_hash === o.file_hash)
      return "Este comprovante tem exatamente o mesmo arquivo de outro já salvo.";
    if (n.auth_code && n.auth_code === o.auth_code)
      return "Este comprovante tem o mesmo código de autenticação de outro comprovante.";
    const sameAmount = Number(n.amount) === Number(o.amount);
    const sameDate = n.payment_date === o.payment_date;
    const sameRecipient =
      n.recipient_name &&
      o.recipient_name &&
      n.recipient_name.toLowerCase() === o.recipient_name.toLowerCase();
    if (sameAmount && sameDate && sameRecipient)
      return "Este comprovante parece repetido porque possui o mesmo valor, a mesma data e o mesmo destinatário de um comprovante já salvo.";
    if (sameAmount && sameDate)
      return "Este comprovante tem o mesmo valor e a mesma data de outro comprovante já salvo.";
    return "Este comprovante tem semelhança alta com outro já salvo. Confira antes de aprovar.";
  }, [data]);

  const run = async (fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Falha");
    }
  };

  return (
    <Dialog
      open={!!receiptId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5" /> Comparação de duplicidade
          </DialogTitle>
          <DialogDescription>Confira lado a lado antes de decidir.</DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar os comprovantes.
          </p>
        ) : (
          <>
            {reason && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-600" />
                <span>{reason}</span>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <ReceiptPanel
                title="Comprovante novo"
                rec={data.newRec}
                url={data.newUrl}
                tone="new"
              />
              {data.oldRec ? (
                <ReceiptPanel
                  title="Comprovante existente"
                  rec={data.oldRec}
                  url={data.oldUrl}
                  tone="old"
                />
              ) : (
                <Card className="grid place-items-center p-8 text-sm text-muted-foreground">
                  Nenhum comprovante existente vinculado.
                </Card>
              )}
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    () => bulkAction({ data: { receiptIds: [data.newRec.id], action: "approve" } }),
                    "Marcado como novo e aprovado",
                  )
                }
              >
                Manter como novo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    () => reject({ data: { receiptId: data.newRec.id, reason: "duplicate" } }),
                    "Novo marcado como duplicado",
                  )
                }
              >
                Marcar novo como duplicado
              </Button>
              {data.oldRec &&
                (() => {
                  const oldRec = data.oldRec;
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await bulkDelete({ data: { receiptIds: [oldRec.id] } });
                        await approve({ data: { receiptId: data.newRec.id } });
                        toast.success("Comprovante antigo substituído");
                        onChanged();
                        onClose();
                      }}
                    >
                      Substituir antigo pelo novo
                    </Button>
                  );
                })()}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    () => bulkAction({ data: { receiptIds: [data.newRec.id], action: "archive" } }),
                    "Novo arquivado",
                  )
                }
              >
                Arquivar novo
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  run(
                    () => reject({ data: { receiptId: data.newRec.id, reason: "rejected" } }),
                    "Novo rejeitado",
                  )
                }
              >
                Rejeitar novo
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={() =>
                  run(
                    () => approve({ data: { receiptId: data.newRec.id } }),
                    "Novo aprovado mesmo assim",
                  )
                }
              >
                Aprovar mesmo assim
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptPanel({
  title,
  rec,
  url,
  tone,
}: {
  title: string;
  rec: any;
  url: string | null;
  tone: "new" | "old";
}) {
  return (
    <Card className={`p-3 ${tone === "new" ? "border-primary/50" : "border-muted"}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {statusBadge(rec.status)}
      </div>
      <div className="mb-3 h-64 overflow-hidden rounded border border-border bg-muted/40">
        {url ? (
          rec.file_mime?.startsWith("image/") ? (
            <img src={url} alt={title} className="h-full w-full object-contain" />
          ) : (
            <iframe src={url} title={title} className="h-full w-full" />
          )
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            Sem prévia
          </div>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Valor</dt>
        <dd className="font-medium">{currencyBRL(Number(rec.amount ?? 0))}</dd>
        <dt className="text-muted-foreground">Data</dt>
        <dd>{dateBR(rec.payment_date)}</dd>
        <dt className="text-muted-foreground">Destinatário</dt>
        <dd className="truncate">{rec.recipient_name ?? "—"}</dd>
        <dt className="text-muted-foreground">Banco</dt>
        <dd>{rec.banks?.name ?? rec.bank_name ?? "—"}</dd>
        <dt className="text-muted-foreground">Cód. autenticação</dt>
        <dd className="truncate">{rec.auth_code ?? "—"}</dd>
        <dt className="text-muted-foreground">Categoria</dt>
        <dd>{rec.category?.name ?? "—"}</dd>
        <dt className="text-muted-foreground">Perfil</dt>
        <dd>{rec.financial_profiles?.name ?? "—"}</dd>
        <dt className="text-muted-foreground">Tipo</dt>
        <dd>
          {rec.transaction_type
            ? transactionTypeLabel[rec.transaction_type as keyof typeof transactionTypeLabel]
            : "—"}
        </dd>
      </dl>
    </Card>
  );
}
