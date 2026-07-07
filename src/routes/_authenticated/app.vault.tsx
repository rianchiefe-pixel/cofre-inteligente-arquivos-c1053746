import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
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
import { CheckCircle2, XCircle, AlertTriangle, Search, ExternalLink, FileText, Loader2, Inbox, Copy, Archive, Trash2, GitCompareArrows } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { approveReceipt, rejectReceipt, bulkReceiptAction, bulkUpdateReceipts, deleteReceipts } from "@/lib/receipts.functions";
import { useCan } from "@/lib/permissions";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/app/vault")({
  head: () => ({ meta: [{ title: "Cofre de comprovantes — Meu Cofre" }] }),
  validateSearch: (s) => z.object({ receipt: z.string().optional() }).parse(s),
  component: VaultPage,
});

type QuickFilter = "all" | "pending" | "suspected" | "high_dup" | "approved" | "rejected" | "archived";

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
  const [preview, setPreview] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setEditing(r);
    const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 60 * 10);
    setPreview(data?.signedUrl ?? null);
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
    },
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["receipts"] }); },
    onError: (e: any) => toast.error(e.message),
  });

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
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setPreview(null); } }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Conferência do comprovante</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
              <div className="rounded-lg border border-border bg-muted/40 p-2">
                {preview ? (
                  editing.file_mime?.startsWith("image/") ? (
                    <img src={preview} alt="Comprovante" className="max-h-[520px] w-full rounded object-contain" />
                  ) : (
                    <iframe src={preview} title="Comprovante" className="h-[520px] w-full rounded" />
                  )
                ) : (
                  <div className="grid h-[520px] place-items-center text-sm text-muted-foreground"><FileText className="mr-2 h-4 w-4" /> Carregando prévia…</div>
                )}
                {preview && <a href={preview} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">Abrir em nova aba <ExternalLink className="h-3 w-3" /></a>}
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
                </div>
                <div className="space-y-1"><Label>Descrição</Label><Textarea defaultValue={editing.description ?? ""} onBlur={(e) => updateReceipt.mutate({ description: e.target.value || null })} /></div>
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
                  {canApprove && <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline"><XCircle className="h-4 w-4" /> Rejeitar</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rejeitar este comprovante?</AlertDialogTitle>
                        <AlertDialogDescription>Ele não entrará no dashboard nem nos relatórios.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => { await reject({ data: { receiptId: editing.id, reason: "rejected" } }); toast.success("Comprovante rejeitado"); invalidate(); setEditing(null); }}>Confirmar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>}
                  {canApprove && <Button variant="success" onClick={async () => { await approve({ data: { receiptId: editing.id } }); toast.success("Aprovado"); invalidate(); setEditing(null); }}>
                    <CheckCircle2 className="h-4 w-4" /> Aprovar
                  </Button>}
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