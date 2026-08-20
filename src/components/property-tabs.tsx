import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { currencyBRL, parseBrlAmount, dateBR, obligationKindLabel, obligationStatusLabel, periodicityLabel, taskPriorityLabel, taskStatusLabel } from "@/lib/format";
import { revealPropertyCredential, savePropertyCredential } from "@/lib/credentials.functions";
import { Pencil, Plus, Trash2, Eye, EyeOff, ExternalLink, Copy, Check, AlertTriangle, Clock, Search, Globe, Mail, User, Lock, Info, Landmark, KeyRound, Repeat } from "lucide-react";
import { LoadingState, ErrorState, EmptyState } from "@/components/query-states";

const sb = supabase as any;

/* ==================== LEASE ==================== */

export function LeaseTab({ propertyId, userId }: { propertyId: string; userId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["lease", propertyId],
    queryFn: async () => {
      const { data, error } = await sb.from("property_leases").select("*").eq("property_id", propertyId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<any>(null);
  const current = form ?? q.data ?? {};

  const save = useMutation({
    mutationFn: async () => {
      // Uma locação por imóvel, criada ou atualizada em uma única operação validada.
      const { data: res, error } = await sb.rpc("upsert_property_lease_rpc", {
        p_property_id: propertyId,
        p_lease: {
          tenant_name: current.tenant_name || null,
          tenant_phone: current.tenant_phone || null,
          tenant_tax_id: current.tenant_tax_id || null,
          rent_amount: current.rent_amount ? parseBrlAmount(current.rent_amount) : null,
          due_day: current.due_day ? Number(current.due_day) : null,
          contract_start: current.contract_start || null,
          contract_end: current.contract_end || null,
          notes: current.notes || null,
        } as never,
      });
      if (error) throw new Error(error.message);
      const saved = Array.isArray(res) ? res[0] : res;
      if (!saved?.lease_id) throw new Error("A locação não foi confirmada pelo banco de dados.");
    },
    onSuccess: () => { toast.success("Dados de locação salvos"); qc.invalidateQueries({ queryKey: ["lease", propertyId] }); setForm(null); },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading) return <LoadingState label="Carregando dados da locação…" />;
  if (q.isError) {
    return (
      <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} title="Não foi possível carregar a locação" />
    );
  }

  const set = (k: string, v: any) => setForm({ ...(form ?? q.data ?? {}), [k]: v });

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Dados da locação</h3>
        <p className="text-sm text-muted-foreground">Informações do contrato e do inquilino.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (save.isPending) return; save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Nome do inquilino</Label>
          <Input value={current.tenant_name ?? ""} onChange={(e) => set("tenant_name", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Telefone</Label>
          <Input value={current.tenant_phone ?? ""} onChange={(e) => set("tenant_phone", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>CPF ou CNPJ</Label>
          <Input value={current.tenant_tax_id ?? ""} onChange={(e) => set("tenant_tax_id", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Valor do aluguel (R$)</Label>
          <Input inputMode="decimal" value={current.rent_amount ?? ""} onChange={(e) => set("rent_amount", e.target.value)} placeholder="0,00" />
        </div>
        <div className="space-y-2">
          <Label>Dia do vencimento</Label>
          <Input type="number" min="1" max="31" value={current.due_day ?? ""} onChange={(e) => set("due_day", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Início do contrato</Label>
          <Input type="date" value={current.contract_start ?? ""} onChange={(e) => set("contract_start", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Término do contrato</Label>
          <Input type="date" value={current.contract_end ?? ""} onChange={(e) => set("contract_end", e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Observações</Label>
          <Textarea rows={3} value={current.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="sm:col-span-2 flex justify-end gap-2">
          {form && <Button type="button" variant="ghost" onClick={() => setForm(null)}>Descartar</Button>}
          <Button type="submit" variant="premium" disabled={save.isPending}>Salvar</Button>
        </div>
      </form>
      {q.data?.rent_amount && (
        <div className="mt-6 rounded-xl border border-border/60 bg-muted/40 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Aluguel mensal</p>
          <p className="mt-1 text-2xl font-bold">{currencyBRL(Number(q.data.rent_amount))}</p>
          {q.data.due_day && <p className="text-xs text-muted-foreground">Vencimento todo dia {q.data.due_day}</p>}
        </div>
      )}
    </Card>
  );
}

/* ==================== OBLIGATIONS ==================== */

type ObligationForm = {
  id?: string; kind: string; label: string; supplier: string; periodicity: string;
  due_date: string; amount: string; status: string; document_url: string; notes: string;
  installation_number: string; consumer_unit: string; registration_number: string;
  client_number: string; contract_number: string; real_estate_tax_id: string;
  credential_id: string; create_task: boolean;
};
const emptyOblig: ObligationForm = {
  kind: "iptu", label: "", supplier: "", periodicity: "mensal",
  due_date: "", amount: "", status: "em_dia", document_url: "", notes: "",
  installation_number: "", consumer_unit: "", registration_number: "",
  client_number: "", contract_number: "", real_estate_tax_id: "",
  credential_id: "none", create_task: false,
};

export function ObligationsTab({ propertyId, userId }: { propertyId: string; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ObligationForm>(emptyOblig);

  const credentials = useQuery({
    queryKey: ["credentials-lookup", propertyId],
    queryFn: async () => {
      const { data } = await sb.from("property_credentials").select("id, service").eq("property_id", propertyId);
      return data || [];
    },
  });

  const list = useQuery({
    queryKey: ["obligations", propertyId],
    queryFn: async () => {
      const { data, error } = await sb.from("property_obligations").select("*").eq("property_id", propertyId).order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        user_id: userId, property_id: propertyId,
        kind: form.kind, label: form.label || null, supplier: form.supplier || null,
        periodicity: form.periodicity || null,
        due_date: form.due_date || null,
        amount: form.amount ? Number(form.amount.replace(",", ".")) : null,
        status: form.status, document_url: form.document_url || null, notes: form.notes || null,
        installation_number: form.installation_number || null,
        consumer_unit: form.consumer_unit || null,
        registration_number: form.registration_number || null,
        client_number: form.client_number || null,
        contract_number: form.contract_number || null,
        real_estate_tax_id: form.real_estate_tax_id || null,
        credential_id: form.credential_id === "none" ? null : form.credential_id,
      };
      
      let obligationId = form.id;
      if (form.id) {
        const { error } = await sb.from("property_obligations").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("property_obligations").insert(payload).select("id").single();
        if (error) throw error;
        obligationId = data.id;
      }

      // Lógica de Lembrete Automático
      if (form.create_task && obligationId) {
        const taskPayload = {
          user_id: userId,
          property_id: propertyId,
          title: `Vencimento: ${form.label || obligationKindLabel[form.kind]}`,
          description: `Obrigação vinculada: ${form.supplier || ""}`,
          due_date: form.due_date || null,
          priority: "media",
          status: "pendente",
        };
        await sb.from("property_tasks").insert(taskPayload);
      }
    },
    onSuccess: () => { 
      toast.success("Obrigação salva"); 
      setOpen(false); 
      setForm(emptyOblig); 
      qc.invalidateQueries({ queryKey: ["obligations", propertyId] }); 
      qc.invalidateQueries({ queryKey: ["tasks", propertyId] });
      qc.invalidateQueries({ queryKey: ["tasks-all"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("property_obligations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Obrigação excluída"); qc.invalidateQueries({ queryKey: ["obligations", propertyId] }); },
  });

  const openEdit = (o: any) => {
    setForm({
      id: o.id, kind: o.kind, label: o.label ?? "", supplier: o.supplier ?? "",
      periodicity: o.periodicity ?? "mensal", due_date: o.due_date ?? "",
      amount: o.amount != null ? String(o.amount) : "", status: o.status ?? "em_dia",
      document_url: o.document_url ?? "", notes: o.notes ?? "",
      installation_number: o.installation_number ?? "",
      consumer_unit: o.consumer_unit ?? "",
      registration_number: o.registration_number ?? "",
      client_number: o.client_number ?? "",
      contract_number: o.contract_number ?? "",
      real_estate_tax_id: o.real_estate_tax_id ?? "",
      credential_id: o.credential_id ?? "none",
      create_task: false,
    });
    setOpen(true);
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Obrigações e despesas</h3>
          <p className="text-sm text-muted-foreground">IPTU, condomínio, contas e demais obrigações recorrentes.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyOblig); } }}>
          <DialogTrigger asChild>
            <Button variant="premium" size="sm"><Plus className="h-4 w-4" /> Nova obrigação</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{form.id ? "Editar obrigação" : "Nova obrigação"}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); if (save.isPending) return; save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo da obrigação *</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(obligationKindLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rótulo (identificação)</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex.: Condomínio bloco A" />
              </div>
              <div className="space-y-2">
                <Label>Concessionária / Órgão</Label>
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Ex: Neoenergia" />
              </div>
              
              <div className="space-y-2">
                <Label>Vínculo com Acesso</Label>
                <Select value={form.credential_id} onValueChange={(v) => setForm({ ...form, credential_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar credencial" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum acesso</SelectItem>
                    {credentials.data?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.service}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Campos Condicionais baseados no Tipo */}
              {(form.kind === "energia" || form.kind === "agua" || form.kind === "gas") && (
                <>
                  <div className="space-y-2">
                    <Label>Número da Instalação</Label>
                    <Input value={form.installation_number} onChange={(e) => setForm({ ...form, installation_number: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade Consumidora</Label>
                    <Input value={form.consumer_unit} onChange={(e) => setForm({ ...form, consumer_unit: e.target.value })} />
                  </div>
                </>
              )}
              {form.kind === "iptu" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Inscrição Imobiliária</Label>
                  <Input value={form.real_estate_tax_id} onChange={(e) => setForm({ ...form, real_estate_tax_id: e.target.value })} />
                </div>
              )}
              {form.kind === "condominio" && (
                <div className="space-y-2">
                  <Label>Matrícula / Unidade</Label>
                  <Input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
                </div>
              )}

              <div className="space-y-2">
                <Label>Periodicidade</Label>
                <Select value={form.periodicity} onValueChange={(v) => setForm({ ...form, periodicity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(periodicityLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor estimado (R$)</Label>
                <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label>Situação atual</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(obligationStatusLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {!form.id && (
                <div className="sm:col-span-2 flex items-center space-x-2 py-2">
                  <Checkbox id="create_task" checked={form.create_task} onCheckedChange={(c) => setForm({ ...form, create_task: !!c })} />
                  <Label htmlFor="create_task" className="text-sm cursor-pointer">Criar lembrete automático na área global de tarefas</Label>
                </div>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label>URL / Link do Documento</Label>
                <Input value={form.document_url} onChange={(e) => setForm({ ...form, document_url: e.target.value })} placeholder="https://…" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Observações Internas</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="premium" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {list.isLoading ? <LoadingState label="Carregando obrigações…" /> :
       list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} title="Não foi possível carregar as obrigações" />
       ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState title="Nenhuma obrigação cadastrada" description="Cadastre IPTU, condomínio, seguros e outras obrigações recorrentes." />
       ) : (
        <div className="divide-y divide-border">
          {list.data!.map((o) => (
            <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{o.label || obligationKindLabel[o.kind] || o.kind}</span>
                  <Badge variant="outline" className="text-[10px]">{obligationKindLabel[o.kind] ?? o.kind}</Badge>
                  <Badge className={`text-[10px] ${o.status === "atrasado" ? "bg-destructive text-destructive-foreground" : o.status === "pago" ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}>{obligationStatusLabel[o.status] ?? o.status}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {o.supplier && <>{o.supplier} • </>}
                  {o.periodicity && <>{periodicityLabel[o.periodicity] ?? o.periodicity} • </>}
                  {o.due_date && <>Vence {dateBR(o.due_date)}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {o.amount != null && <span className="text-sm font-semibold">{currencyBRL(Number(o.amount))}</span>}
                {o.document_url && <a href={o.document_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
                <Button size="sm" variant="ghost" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Excluir obrigação?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate(o.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
       )}
    </Card>
  );
}

/* ==================== CREDENTIALS ==================== */

type CredForm = { 
  id?: string; service: string; website: string; access_link: string; 
  login: string; password: string; recovery_email: string; notes: string; 
  property_ids: string[];
};
const emptyCred: CredForm = { 
  service: "", website: "", access_link: "", login: "", 
  password: "", recovery_email: "", notes: "", property_ids: [] 
};

const CRED_COLUMNS = "id, service, website, access_link, login, recovery_email, notes, password_set_at, created_at";

export function CredentialsTab({ propertyId }: { propertyId: string; userId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CredForm>(emptyCred);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const saveCredential = useServerFn(savePropertyCredential);
  const revealCredential = useServerFn(revealPropertyCredential);

  const list = useQuery({
    queryKey: ["credentials", propertyId],
    queryFn: async () => {
      // Busca credenciais vinculadas a este imóvel via tabela N:N
      const { data, error } = await sb.from("property_credential_links")
        .select(`
          credential:property_credentials (${CRED_COLUMNS})
        `)
        .eq("property_id", propertyId);
      if (error) throw error;
      return (data || []).map((d: any) => d.credential);
    },
  });

  const allProperties = useQuery({
    queryKey: ["all-properties-lookup"],
    queryFn: async () => {
      const { data } = await sb.from("properties").select("id, name, profile_id");
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      return await saveCredential({
        data: {
          id: form.id ?? null,
          property_id: propertyId,
          property_ids: form.property_ids,
          service: form.service,
          website: form.website || null,
          access_link: form.access_link || null,
          login: form.login || null,
          recovery_email: form.recovery_email || null,
          notes: form.notes || null,
          password: form.id ? (form.password ? form.password : null) : (form.password || null),
        },
      });
    },
    onSuccess: () => {
      toast.success("Acesso salvo");
      setOpen(false);
      setForm(emptyCred);
      setRevealed({});
      qc.invalidateQueries({ queryKey: ["credentials", propertyId] });
      qc.invalidateQueries({ queryKey: ["credentials-lookup", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Verifica se há outros vínculos
      const { count } = await sb.from("property_credential_links").select("*", { count: 'exact', head: true }).eq("credential_id", id);
      
      if (count > 1) {
        // Apenas remove o vínculo deste imóvel
        const { error } = await sb.from("property_credential_links").delete().eq("credential_id", id).eq("property_id", propertyId);
        if (error) throw error;
        return { type: "unlinked" };
      } else {
        // Exclui a credencial completamente
        const { error } = await sb.from("property_credentials").delete().eq("id", id);
        if (error) throw error;
        return { type: "deleted" };
      }
    },
    onSuccess: (res) => { 
      toast.success(res.type === "unlinked" ? "Vínculo removido" : "Acesso excluído"); 
      qc.invalidateQueries({ queryKey: ["credentials", propertyId] });
      qc.invalidateQueries({ queryKey: ["credentials-lookup", propertyId] });
    },
  });

  const openEdit = async (c: any) => {
    // Busca todos os imóveis vinculados para o formulário
    const { data } = await sb.from("property_credential_links").select("property_id").eq("credential_id", c.id);
    const linkedIds = (data || []).map((d: any) => d.property_id);

    setForm({
      id: c.id, service: c.service ?? "", website: c.website ?? "", access_link: c.access_link ?? "",
      login: c.login ?? "", password: "", recovery_email: c.recovery_email ?? "", notes: c.notes ?? "",
      property_ids: linkedIds,
    });
    setOpen(true);
  };

  const toggleReveal = async (id: string) => {
    if (revealed[id]) {
      setRevealed((v) => { const next = { ...v }; delete next[id]; return next; });
      return;
    }
    setRevealing(id);
    try {
      const res = await revealCredential({ data: { id } });
      if (!res.password) { toast.error("Senha não cadastrada"); return; }
      setRevealed((v) => ({ ...v, [id]: res.password! }));
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao revelar senha");
    } finally {
      setRevealing(null);
    }
  };

  const copyPassword = async (id: string) => {
    let value = revealed[id];
    if (!value) {
      try {
        const res = await revealCredential({ data: { id } });
        if (!res.password) { toast.error("Senha não cadastrada"); return; }
        value = res.password;
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao copiar senha");
        return;
      }
    }
    await copy(id + "_p", value);
  };

  const copy = async (id: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(id); setTimeout(() => setCopied(null), 1500); }
    catch { toast.error("Falha ao copiar"); }
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">Acessos <Badge variant="outline" className="text-[10px]">Protegido</Badge></h3>
          <p className="text-sm text-muted-foreground">Credenciais de serviços vinculados ao imóvel. Senhas ficam ocultas por padrão.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyCred); }}>
          <DialogTrigger asChild><Button variant="premium" size="sm"><Plus className="h-4 w-4" /> Novo acesso</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                {form.id ? "Editar acesso" : "Novo acesso às credenciais"}
              </DialogTitle>
            </DialogHeader>
            
            <ScrollArea className="flex-1 p-6">
              <form onSubmit={(e) => { e.preventDefault(); if (save.isPending) return; save.mutate(); }} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Serviço ou fornecedor *</Label>
                    <div className="relative">
                      <Landmark className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input required className="pl-9" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Ex.: Neoenergia, Embasa, Prefeitura" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Link de acesso (URL)</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" value={form.access_link} onChange={(e) => setForm({ ...form, access_link: e.target.value })} placeholder="https://…" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Site principal</Label>
                    <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="exemplo.com.br" />
                  </div>

                  <div className="space-y-2">
                    <Label>Usuário / Login</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} autoComplete="off" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input type="password" className="pl-9" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" placeholder={form.id ? "•••••••• (deixe vazio p/ manter)" : ""} />
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>E-mail de recuperação</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" type="email" value={form.recovery_email} onChange={(e) => setForm({ ...form, recovery_email: e.target.value })} />
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2 p-4 border rounded-lg bg-muted/20">
                    <Label className="flex items-center gap-2 mb-3">
                      <Repeat className="h-4 w-4 text-primary" />
                      Compartilhamento entre Imóveis
                    </Label>
                    <p className="text-xs text-muted-foreground mb-4">Selecione quais outros imóveis utilizam esta mesma credencial.</p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2">
                      {allProperties.data?.map((p: any) => (
                        <div key={p.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`prop-${p.id}`} 
                            checked={form.property_ids.includes(p.id) || p.id === propertyId}
                            disabled={p.id === propertyId}
                            onCheckedChange={(checked) => {
                              if (checked) setForm({ ...form, property_ids: [...form.property_ids, p.id] });
                              else setForm({ ...form, property_ids: form.property_ids.filter(id => id !== p.id) });
                            }}
                          />
                          <Label htmlFor={`prop-${p.id}`} className="text-xs truncate cursor-pointer">{p.name}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>Observações sobre o acesso</Label>
                    <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-background pb-2">
                  <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" variant="premium" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar Acesso"}</Button>
                </div>
              </form>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      {list.isLoading ? <LoadingState label="Carregando acessos…" /> :
       list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} title="Não foi possível carregar os acessos" />
       ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState title="Nenhum acesso cadastrado" description="As senhas ficam criptografadas na sua conta e ocultas por padrão." />
       ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data!.map((c: any) => (
            <div key={c.id} className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.service}</p>
                  {c.website && <p className="truncate text-xs text-muted-foreground">{c.website}</p>}
                </div>
                <div className="flex gap-1">
                  {c.access_link && <a href={c.access_link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Excluir acesso?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {c.login && (
                <div className="mt-2 grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Login</span>
                  <span className="truncate font-mono">{c.login}</span>
                  <Button size="sm" variant="ghost" onClick={() => copy(c.id + "_l", c.login)}>{copied === c.id + "_l" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</Button>
                </div>
              )}
              <div className="mt-1 grid grid-cols-[80px_minmax(0,1fr)_auto_auto] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Senha</span>
                  <span className="truncate font-mono">{revealed[c.id] ?? "••••••••"}</span>
                  <Button size="sm" variant="ghost" disabled={revealing === c.id} onClick={() => toggleReveal(c.id)}>{revealed[c.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</Button>
                  <Button size="sm" variant="ghost" onClick={() => copyPassword(c.id)}>{copied === c.id + "_p" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</Button>
              </div>
              {c.recovery_email && <p className="mt-2 text-xs text-muted-foreground">Recuperação: {c.recovery_email}</p>}
              {c.notes && <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}
            </div>
          ))}
        </div>
       )}
    </Card>
  );
}

/* ==================== TASKS ==================== */

export type TaskForm = {
  id?: string; title: string; description: string; due_date: string;
  assignee: string; priority: string; status: string; notes: string;
  property_id?: string | null;
};
export const emptyTask: TaskForm = { title: "", description: "", due_date: "", assignee: "", priority: "media", status: "pendente", notes: "" };

export function daysUntil(due?: string | null): number | null {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

const PRIORITY_TONE: Record<string, string> = {
  baixa: "bg-slate-500 text-white",
  media: "bg-blue-600 text-white",
  alta: "bg-orange-600 text-white",
  urgente: "bg-destructive text-destructive-foreground",
};
const STATUS_TONE: Record<string, string> = {
  pendente: "bg-secondary text-secondary-foreground",
  em_andamento: "bg-primary text-primary-foreground",
  concluida: "bg-success text-success-foreground",
  cancelada: "bg-muted text-muted-foreground",
  aguardando_terceiros: "bg-amber-600 text-white",
};

export function TaskEditor({ open, onOpenChange, form, setForm, onSave, saving, showProperty, properties }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  form: TaskForm; setForm: (f: TaskForm) => void;
  onSave: () => void; saving?: boolean;
  showProperty?: boolean; properties?: { id: string; name: string }[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Título</Label>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {showProperty && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Imóvel</Label>
              <Select value={form.property_id ?? "none"} onValueChange={(v) => setForm({ ...form, property_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Prazo</Label>
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Responsável</Label>
            <Input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(taskPriorityLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(taskStatusLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="premium" disabled={saving}>Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaskRow({ t, onEdit, onQuickStatus, onRemove, showProperty, busy }: {
  t: any; onEdit: () => void;
  onQuickStatus: (status: string) => void;
  onRemove: () => void;
  showProperty?: boolean;
  /** Bloqueia todas as ações da linha enquanto alguma mutação está em andamento. */
  busy?: boolean;
}) {
  const d = daysUntil(t.due_date);
  const overdue = d != null && d < 0 && !["concluida", "cancelada"].includes(t.status);
  const dueLabel = d == null ? null : d < 0 ? `Atrasada ${-d}d` : d === 0 ? "Vence hoje" : `Faltam ${d}d`;
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border p-3 ${overdue ? "border-destructive/60 bg-destructive/5" : "border-border/60"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium truncate">{t.title}</span>
          <Badge className={`text-[10px] ${PRIORITY_TONE[t.priority] ?? ""}`}>{taskPriorityLabel[t.priority] ?? t.priority}</Badge>
          <Badge className={`text-[10px] ${STATUS_TONE[t.status] ?? ""}`}>{taskStatusLabel[t.status] ?? t.status}</Badge>
          {overdue && <Badge className="text-[10px] bg-destructive text-destructive-foreground"><AlertTriangle className="mr-1 h-3 w-3" /> Atrasada</Badge>}
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {t.assignee && <span>👤 {t.assignee}</span>}
          {t.due_date && <span className={overdue ? "text-destructive font-medium" : ""}><Clock className="inline h-3 w-3" /> {dateBR(t.due_date)} {dueLabel && `· ${dueLabel}`}</span>}
          {showProperty && t.properties?.name && <span>🏠 {t.properties.name}</span>}
        </p>
        {t.description && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">{t.description}</p>}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1">
          {t.status !== "concluida" && <Button size="sm" variant="ghost" title="Concluir" disabled={busy} onClick={() => onQuickStatus("concluida")}><Check className="h-4 w-4 text-success" /></Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button size="sm" variant="ghost" disabled={busy} className="text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Excluir tarefa?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (busy) return; onRemove(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export function PropertyTasksTab({ propertyId, userId }: { propertyId: string; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TaskForm>(emptyTask);

  const list = useQuery({
    queryKey: ["tasks", propertyId],
    queryFn: async () => {
      const { data, error } = await sb.from("property_tasks").select("*").eq("property_id", propertyId).order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        user_id: userId, property_id: propertyId,
        title: form.title, description: form.description || null,
        due_date: form.due_date || null, assignee: form.assignee || null,
        priority: form.priority, status: form.status, notes: form.notes || null,
        completed_at: form.status === "concluida" ? new Date().toISOString() : null,
      };
      if (form.id) {
        const { error } = await sb.from("property_tasks").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("property_tasks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Tarefa salva"); setOpen(false); setForm(emptyTask); qc.invalidateQueries({ queryKey: ["tasks", propertyId] }); qc.invalidateQueries({ queryKey: ["tasks-all"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const quickStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      // Reabrir uma tarefa concluída precisa zerar a data de conclusão.
      patch.completed_at = status === "concluida" ? new Date().toISOString() : null;
      const { data, error } = await sb.from("property_tasks").update(patch).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("Nenhuma tarefa foi atualizada.");
    },
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["tasks", propertyId] }); qc.invalidateQueries({ queryKey: ["tasks-all"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar o status"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from("property_tasks").delete().eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("A exclusão não foi confirmada pelo banco de dados.");
    },
    onSuccess: () => { toast.success("Tarefa excluída"); qc.invalidateQueries({ queryKey: ["tasks", propertyId] }); qc.invalidateQueries({ queryKey: ["tasks-all"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível excluir a tarefa"),
  });

  const busy = save.isPending || quickStatus.isPending || remove.isPending;

  const openEdit = (t: any) => {
    setForm({
      id: t.id, title: t.title, description: t.description ?? "", due_date: t.due_date ?? "",
      assignee: t.assignee ?? "", priority: t.priority, status: t.status, notes: t.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Tarefas do imóvel</h3>
          <p className="text-sm text-muted-foreground">Pendências, reformas, documentação e acompanhamento.</p>
        </div>
        <Button variant="premium" size="sm" disabled={busy} onClick={() => { setForm(emptyTask); setOpen(true); }}><Plus className="h-4 w-4" /> Nova tarefa</Button>
      </div>

      {list.isLoading ? <LoadingState label="Carregando tarefas…" /> :
       list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} title="Não foi possível carregar as tarefas" />
       ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState title="Nenhuma tarefa cadastrada" description="Registre pendências, reformas e prazos deste imóvel." />
       ) : (
        <div className="space-y-2">
          {list.data!.map((t) => (
            <TaskRow key={t.id} t={t} busy={busy} onEdit={() => openEdit(t)} onQuickStatus={(s) => { if (busy) return; quickStatus.mutate({ id: t.id, status: s }); }} onRemove={() => { if (busy) return; remove.mutate(t.id); }} />
          ))}
        </div>
       )}

      <TaskEditor open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyTask); }} form={form} setForm={setForm} onSave={() => { if (save.isPending) return; save.mutate(); }} saving={save.isPending} />
    </Card>
  );
}