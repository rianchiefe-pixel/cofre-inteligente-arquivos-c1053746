import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { currencyBRL, dateBR, paymentMethodLabel, transactionTypeLabel } from "@/lib/format";
import { CheckCircle2, XCircle, AlertTriangle, Search, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { approveReceipt, rejectReceipt } from "@/lib/receipts.functions";

export const Route = createFileRoute("/_authenticated/app/vault")({
  head: () => ({ meta: [{ title: "Cofre de comprovantes — Meu Cofre" }] }),
  component: VaultPage,
});

function VaultPage() {
  const qc = useQueryClient();
  const approve = useServerFn(approveReceipt);
  const reject = useServerFn(rejectReceipt);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [profileId, setProfileId] = useState<string>("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const categories = useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [] });

  const receipts = useQuery({
    queryKey: ["receipts", status, profileId],
    queryFn: async () => {
      let q = supabase.from("receipts").select("*, categories(name), financial_profiles(name)").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status as any);
      if (profileId !== "all") q = q.eq("profile_id", profileId);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return receipts.data ?? [];
    return (receipts.data ?? []).filter((r: any) =>
      [r.recipient_name, r.description, r.bank_name, r.auth_code].filter(Boolean).some((v: string) => v.toLowerCase().includes(term))
    );
  }, [q, receipts.data]);

  const updateReceipt = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("receipts").update(patch).eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["receipts"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const openReceipt = async (r: any) => {
    setSelected(r);
    const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 60 * 10);
    setPreview(data?.signedUrl ?? null);
  };

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-success text-success-foreground hover:bg-success">Aprovado</Badge>;
    if (s === "duplicate") return <Badge className="bg-accent text-accent-foreground hover:bg-accent">Duplicado</Badge>;
    if (s === "rejected") return <Badge variant="destructive">Rejeitado</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Cofre de comprovantes</h1>
        <p className="text-sm text-muted-foreground">Conferência, busca e organização.</p>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por destinatário, descrição, banco…" className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="approved">Aprovados</SelectItem>
              <SelectItem value="duplicate">Duplicados</SelectItem>
              <SelectItem value="rejected">Rejeitados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum comprovante encontrado.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map((r: any) => (
              <button key={r.id} onClick={() => openReceipt(r)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{r.recipient_name || r.description || r.file_name || "Comprovante"}</p>
                    {statusBadge(r.status)}
                    {r.ocr_status !== "done" && r.ocr_status !== "queued" && <Badge variant="outline" className="text-xs">{r.ocr_status}</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {dateBR(r.payment_date)} • {r.bank_name ?? "—"} • {r.categories?.name ?? "sem categoria"} • {r.financial_profiles?.name ?? "—"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">{currencyBRL(Number(r.amount ?? 0))}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setPreview(null); } }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Conferência do comprovante</DialogTitle></DialogHeader>
          {selected && (
            <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
              <div className="rounded-lg border border-border bg-muted/40 p-2">
                {preview ? (
                  selected.file_mime?.startsWith("image/") ? (
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
                {selected.duplicate_of && (
                  <div className="flex items-start gap-2 rounded-lg border border-accent/50 bg-accent/10 p-3 text-xs">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-accent" />
                    <div>Este comprovante parece duplicado de outro já enviado. Confira antes de aprovar.</div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Data</Label><Input type="date" defaultValue={selected.payment_date ?? ""} onBlur={(e) => updateReceipt.mutate({ payment_date: e.target.value || null })} /></div>
                  <div className="space-y-1"><Label>Valor</Label><Input type="number" step="0.01" defaultValue={selected.amount ?? ""} onBlur={(e) => updateReceipt.mutate({ amount: e.target.value ? Number(e.target.value) : null })} /></div>
                </div>
                <div className="space-y-1"><Label>Destinatário</Label><Input defaultValue={selected.recipient_name ?? ""} onBlur={(e) => updateReceipt.mutate({ recipient_name: e.target.value || null })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Banco de origem</Label><Input defaultValue={selected.bank_name ?? ""} onBlur={(e) => updateReceipt.mutate({ bank_name: e.target.value || null })} /></div>
                  <div className="space-y-1"><Label>Código de autenticação</Label><Input defaultValue={selected.auth_code ?? ""} onBlur={(e) => updateReceipt.mutate({ auth_code: e.target.value || null })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Forma de pagamento</Label>
                    <Select defaultValue={selected.payment_method ?? undefined} onValueChange={(v) => updateReceipt.mutate({ payment_method: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{Object.entries(paymentMethodLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <Select defaultValue={selected.transaction_type ?? undefined} onValueChange={(v) => updateReceipt.mutate({ transaction_type: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{Object.entries(transactionTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <Select defaultValue={selected.category_id ?? undefined} onValueChange={(v) => updateReceipt.mutate({ category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Descrição</Label><Textarea defaultValue={selected.description ?? ""} onBlur={(e) => updateReceipt.mutate({ description: e.target.value || null })} /></div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={async () => { await reject({ data: { receiptId: selected.id, reason: "rejected" } }); toast.success("Rejeitado"); qc.invalidateQueries({ queryKey: ["receipts"] }); setSelected(null); }}>
                    <XCircle className="h-4 w-4" /> Rejeitar
                  </Button>
                  <Button variant="success" onClick={async () => { await approve({ data: { receiptId: selected.id } }); toast.success("Aprovado"); qc.invalidateQueries({ queryKey: ["receipts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setSelected(null); }}>
                    <CheckCircle2 className="h-4 w-4" /> Aprovar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}