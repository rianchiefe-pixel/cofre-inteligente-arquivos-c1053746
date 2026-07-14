import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Check,
  X,
  Clock,
  Plus,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { formatBrl } from "@/lib/format";
import {
  setTransactionStatus,
  updateTransaction,
  addManualTransaction,
  finalizeStatement,
} from "@/lib/card-statement.functions";

type Txn = any;

const KIND_LABEL: Record<string, string> = {
  compra: "Compra",
  tarifa: "Tarifa",
  anuidade: "Anuidade",
  juros: "Juros",
  encargo: "Encargo",
  seguro: "Seguro",
  saque: "Saque",
  pagamento: "Pagamento",
  estorno: "Estorno",
  credito: "Crédito",
  ajuste: "Ajuste",
  assinatura: "Assinatura",
  cancelada: "Cancelada",
  iof: "IOF",
  outros: "Outros",
};

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-600 border-red-500/30",
  later: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  pending: "bg-muted text-muted-foreground",
  duplicate: "bg-orange-500/15 text-orange-600 border-orange-500/30",
};

export function CardStatementReview({
  statementId,
  open,
  onOpenChange,
}: {
  statementId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const setStatusFn = useServerFn(setTransactionStatus);
  const updateFn = useServerFn(updateTransaction);
  const addFn = useServerFn(addManualTransaction);
  const finalizeFn = useServerFn(finalizeStatement);
  const [activeHolder, setActiveHolder] = useState<string>("all");
  const [manualOpen, setManualOpen] = useState(false);

  const stmt = useQuery({
    queryKey: ["card-statement", statementId],
    enabled: !!statementId,
    queryFn: async () =>
      (
        await supabase
          .from("card_statements")
          .select("*, cards(name, brand, last4)")
          .eq("id", statementId!)
          .single()
      ).data,
  });
  const txns = useQuery({
    queryKey: ["card-txns", statementId],
    enabled: !!statementId,
    queryFn: async () =>
      (
        await supabase
          .from("card_transactions")
          .select("*, card_holders(holder_name, last4)")
          .eq("statement_id", statementId!)
          .order("txn_date", { ascending: true })
      ).data ?? [],
  });

  const holders = useMemo(() => {
    const map = new Map<string, { key: string; label: string; last4?: string }>();
    for (const t of (txns.data ?? []) as Txn[]) {
      const hn = t.card_holders?.holder_name ?? t.holder_name ?? "Sem titular";
      const l4 = t.card_holders?.last4 ?? t.last4 ?? "";
      const key = `${hn}|${l4}`;
      if (!map.has(key)) map.set(key, { key, label: hn, last4: l4 });
    }
    return Array.from(map.values());
  }, [txns.data]);

  const filtered = useMemo(() => {
    const all = (txns.data ?? []) as Txn[];
    if (activeHolder === "all") return all;
    return all.filter((t) => {
      const hn = t.card_holders?.holder_name ?? t.holder_name ?? "Sem titular";
      const l4 = t.card_holders?.last4 ?? t.last4 ?? "";
      return `${hn}|${l4}` === activeHolder;
    });
  }, [txns.data, activeHolder]);

  const stats = useMemo(() => {
    const all = (txns.data ?? []) as Txn[];
    const by = { pending: 0, approved: 0, rejected: 0, later: 0, duplicate: 0, low: 0, total: 0 };
    let approvedSum = 0;
    for (const t of all) {
      by[(t.status as keyof typeof by) ?? "pending"] =
        (by[(t.status as keyof typeof by) ?? "pending"] ?? 0) + 1;
      if (t.low_confidence) by.low += 1;
      by.total += 1;
      if (t.status === "approved") approvedSum += Number(t.amount ?? 0);
    }
    return { ...by, approvedSum };
  }, [txns.data]);

  const bulk = useMutation({
    mutationFn: async (status: "approved" | "rejected" | "later") => {
      const ids = filtered.map((t: Txn) => t.id);
      if (!ids.length) return;
      await setStatusFn({ data: { ids, status } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["card-txns", statementId] });
    },
  });

  const single = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected" | "later" | "pending" }) => {
      await setStatusFn({ data: { ids: [v.id], status: v.status } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-txns", statementId] }),
  });

  const edit = useMutation({
    mutationFn: async (v: { id: string; patch: any }) => {
      await updateFn({ data: v });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-txns", statementId] }),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      await finalizeFn({ data: { statementId: statementId! } });
    },
    onSuccess: () => {
      toast.success("Fatura confirmada");
      qc.invalidateQueries({ queryKey: ["card-statements"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!stmt.data) return null;
  const s = stmt.data as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] max-h-[92vh] overflow-hidden p-0">
        <div className="border-b p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Conferência da fatura — {s.cards?.name}
              <Badge variant="outline">{s.bank_name ?? "Banco"}</Badge>
              {s.period_start && (
                <Badge variant="outline">
                  {s.period_start} a {s.period_end ?? "?"}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-6">
            <Metric label="Total identificado" value={stats.total} />
            <Metric label="Pendentes" value={stats.pending} tone="amber" />
            <Metric label="Aprovados" value={stats.approved} tone="emerald" />
            <Metric label="Duplicidades" value={stats.duplicate} tone="orange" />
            <Metric label="Baixa confiança" value={stats.low} tone="red" />
            <Metric label="Total aprovado" value={currencyBRL(stats.approvedSum)} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-b p-3">
          <Tabs value={activeHolder} onValueChange={setActiveHolder}>
            <TabsList>
              <TabsTrigger value="all">Todos ({txns.data?.length ?? 0})</TabsTrigger>
              {holders.map((h) => (
                <TabsTrigger key={h.key} value={h.key}>
                  {h.label}
                  {h.last4 ? ` • ${h.last4}` : ""}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("approved")}>
              <Check className="h-3 w-3" /> Aprovar todos
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("later")}>
              <Clock className="h-3 w-3" /> Verificar depois
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("rejected")}>
              <X className="h-3 w-3" /> Negar todos
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setManualOpen(true)}>
              <Plus className="h-3 w-3" /> Adicionar transação
            </Button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Cartão</TableHead>
                <TableHead>Parc.</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t: Txn) => (
                <TableRow key={t.id} className={t.low_confidence ? "bg-amber-500/5" : ""}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {t.txn_date ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <Input
                      defaultValue={t.description ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== t.description)
                          edit.mutate({ id: t.id, patch: { description: e.target.value } });
                      }}
                    />
                    {t.low_confidence && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> baixa confiança
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.card_holders?.holder_name ?? t.holder_name ?? "—"}
                    <br />
                    <span className="text-muted-foreground">
                      {t.card_holders?.last4 ?? t.last4 ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {t.installment_current && t.installment_total
                      ? `${t.installment_current}/${t.installment_total}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline">{KIND_LABEL[t.kind] ?? t.kind}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {currencyBRL(Number(t.amount ?? 0))}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                        STATUS_TONE[t.status] ?? ""
                      }`}
                    >
                      {t.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-emerald-600"
                        onClick={() => single.mutate({ id: t.id, status: "approved" })}
                        title="Aprovar"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-amber-600"
                        onClick={() => single.mutate({ id: t.id, status: "later" })}
                        title="Verificar depois"
                      >
                        <Clock className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-600"
                        onClick={() => single.mutate({ id: t.id, status: "rejected" })}
                        title="Negar"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma transação nesta aba.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <div className="text-xs text-muted-foreground">
            Pagamentos, estornos e créditos não geram nova despesa — são tratados como
            movimentação de quitação/ajuste da fatura.
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button
              variant="premium"
              disabled={finalize.isPending}
              onClick={() => finalize.mutate()}
            >
              {finalize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar fatura
            </Button>
          </div>
        </div>

        <ManualDialog
          open={manualOpen}
          onOpenChange={setManualOpen}
          onSubmit={async (payload) => {
            await addFn({ data: { statementId: statementId!, txn: payload } });
            qc.invalidateQueries({ queryKey: ["card-txns", statementId] });
            toast.success("Transação adicionada");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "emerald" | "amber" | "red" | "orange";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "red"
          ? "text-red-600"
          : tone === "orange"
            ? "text-orange-600"
            : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${cls}`}>{value}</p>
    </div>
  );
}

function ManualDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (v: any) => Promise<void>;
}) {
  const [form, setForm] = useState<any>({
    txn_date: "",
    description: "",
    amount: "",
    installment_current: "",
    installment_total: "",
    category: "",
    kind: "compra",
    notes: "",
  });
  const submit = async () => {
    await onSubmit({
      txn_date: form.txn_date || null,
      description: form.description,
      amount: Number(String(form.amount).replace(",", ".")),
      installment_current: form.installment_current ? Number(form.installment_current) : null,
      installment_total: form.installment_total ? Number(form.installment_total) : null,
      category: form.category || null,
      kind: form.kind,
      notes: form.notes || null,
    });
    onOpenChange(false);
    setForm({ txn_date: "", description: "", amount: "", installment_current: "", installment_total: "", category: "", kind: "compra", notes: "" });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar transação não localizada</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Data</label>
              <Input type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Valor</label>
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Descrição</label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Parcela atual</label>
              <Input type="number" value={form.installment_current} onChange={(e) => setForm({ ...form, installment_current: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Parcelas totais</label>
              <Input type="number" value={form.installment_total} onChange={(e) => setForm({ ...form, installment_total: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Categoria</label>
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Observação</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="premium" onClick={submit} disabled={!form.description || !form.amount}>Adicionar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}