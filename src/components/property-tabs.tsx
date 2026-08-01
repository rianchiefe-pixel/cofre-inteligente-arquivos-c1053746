import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { currencyBRL, dateBR, obligationKindLabel, obligationStatusLabel, periodicityLabel, taskPriorityLabel, taskStatusLabel } from "@/lib/format";
import { Pencil, Plus, Trash2, Eye, EyeOff, ExternalLink, Copy, Check, AlertTriangle, Clock } from "lucide-react";

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

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const set = (k: string, v: any) => setForm({ ...(form ?? q.data ?? {}), [k]: v });

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Dados da locação</h3>
        <p className="text-sm text-muted-foreground">Informações do contrato e do inquilino.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
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
};
const emptyOblig: ObligationForm = {
  kind: "iptu", label: "", supplier: "", periodicity: "mensal",
  due_date: "", amount: "", status: "em_dia", document_url: "", notes: "",
};

export function ObligationsTab({ propertyId, userId }: { propertyId: string; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ObligationForm>(emptyOblig);

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
      };
      if (form.id) {
        const { error } = await sb.from("property_obligations").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("property_obligations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Obrigação salva"); setOpen(false); setForm(emptyOblig); qc.invalidateQueries({ queryKey: ["obligations", propertyId] }); },
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
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(obligationKindLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rótulo (opcional)</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex.: Condomínio bloco A" />
              </div>
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              </div>
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
                <Label>Valor (R$)</Label>
                <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(obligationStatusLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>URL do documento</Label>
                <Input value={form.document_url} onChange={(e) => setForm({ ...form, document_url: e.target.value })} placeholder="https://…" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Observação</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="premium" disabled={save.isPending}>Salvar</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {list.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
       (list.data?.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Nenhuma obrigação cadastrada ainda.</p>
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

type CredForm = { id?: string; service: string; website: string; access_link: string; login: string; password: string; recovery_email: string; notes: string; };
const emptyCred: CredForm = { service: "", website: "", access_link: "", login: "", password: "", recovery_email: "", notes: "" };

export function CredentialsTab({ propertyId, userId }: { propertyId: string; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CredForm>(emptyCred);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["credentials", propertyId],
    queryFn: async () => {
      const { data, error } = await sb.from("property_credentials").select("*").eq("property_id", propertyId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        user_id: userId, property_id: propertyId,
        service: form.service, website: form.website || null, access_link: form.access_link || null,
        login: form.login || null, password: form.password || null,
        recovery_email: form.recovery_email || null, notes: form.notes || null,
      };
      if (form.id) {
        const { error } = await sb.from("property_credentials").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("property_credentials").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Acesso salvo"); setOpen(false); setForm(emptyCred); qc.invalidateQueries({ queryKey: ["credentials", propertyId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("property_credentials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Acesso excluído"); qc.invalidateQueries({ queryKey: ["credentials", propertyId] }); },
  });

  const openEdit = (c: any) => {
    setForm({
      id: c.id, service: c.service ?? "", website: c.website ?? "", access_link: c.access_link ?? "",
      login: c.login ?? "", password: c.password ?? "", recovery_email: c.recovery_email ?? "", notes: c.notes ?? "",
    });
    setOpen(true);
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
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{form.id ? "Editar acesso" : "Novo acesso"}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Serviço ou fornecedor</Label>
                <Input required value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Ex.: Portal do IPTU" />
              </div>
              <div className="space-y-2">
                <Label>Site</Label>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="site.com.br" />
              </div>
              <div className="space-y-2">
                <Label>Link de acesso</Label>
                <Input value={form.access_link} onChange={(e) => setForm({ ...form, access_link: e.target.value })} placeholder="https://…" />
              </div>
              <div className="space-y-2">
                <Label>Login</Label>
                <Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>E-mail de recuperação</Label>
                <Input type="email" value={form.recovery_email} onChange={(e) => setForm({ ...form, recovery_email: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Informações adicionais</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="premium" disabled={save.isPending}>Salvar</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {list.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
       (list.data?.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Nenhum acesso cadastrado. As senhas são armazenadas apenas na sua conta e ficam ocultas por padrão.</p>
       ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data!.map((c) => (
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
              {c.password && (
                <div className="mt-1 grid grid-cols-[80px_minmax(0,1fr)_auto_auto] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Senha</span>
                  <span className="truncate font-mono">{visible[c.id] ? c.password : "••••••••"}</span>
                  <Button size="sm" variant="ghost" onClick={() => setVisible((v) => ({ ...v, [c.id]: !v[c.id] }))}>{visible[c.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</Button>
                  <Button size="sm" variant="ghost" onClick={() => copy(c.id + "_p", c.password)}>{copied === c.id + "_p" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</Button>
                </div>
              )}
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

export function TaskRow({ t, onEdit, onQuickStatus, onRemove, showProperty }: {
  t: any; onEdit: () => void;
  onQuickStatus: (status: string) => void;
  onRemove: () => void;
  showProperty?: boolean;
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
          {t.status !== "concluida" && <Button size="sm" variant="ghost" title="Concluir" onClick={() => onQuickStatus("concluida")}><Check className="h-4 w-4 text-success" /></Button>}
          <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Excluir tarefa?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={onRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter>
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
      if (status === "concluida") patch.completed_at = new Date().toISOString();
      const { error } = await sb.from("property_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks", propertyId] }); qc.invalidateQueries({ queryKey: ["tasks-all"] }); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("property_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa excluída"); qc.invalidateQueries({ queryKey: ["tasks", propertyId] }); qc.invalidateQueries({ queryKey: ["tasks-all"] }); },
  });

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
        <Button variant="premium" size="sm" onClick={() => { setForm(emptyTask); setOpen(true); }}><Plus className="h-4 w-4" /> Nova tarefa</Button>
      </div>

      {list.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
       (list.data?.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Nenhuma tarefa cadastrada.</p>
       ) : (
        <div className="space-y-2">
          {list.data!.map((t) => (
            <TaskRow key={t.id} t={t} onEdit={() => openEdit(t)} onQuickStatus={(s) => quickStatus.mutate({ id: t.id, status: s })} onRemove={() => remove.mutate(t.id)} />
          ))}
        </div>
       )}

      <TaskEditor open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyTask); }} form={form} setForm={setForm} onSave={() => save.mutate()} saving={save.isPending} />
    </Card>
  );
}