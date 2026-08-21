import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { centsToNumber, currencyBRL, parseBrlAmountToCents, propertyPurposeLabel, propertyStatusLabel, propertyTypeLabel } from "@/lib/format";
import { Home, Plus, Pencil, Trash2, MapPin, ChevronRight, Archive, Search, LayoutGrid, List } from "lucide-react";
import { useCan } from "@/lib/permissions";
import { RestrictedArea } from "@/components/role-gate";
import { LoadingState, ErrorState, EmptyState } from "@/components/query-states";

export const Route = createFileRoute("/_authenticated/app/properties/")({
  head: () => ({ meta: [{ title: "Imóveis — Meu Cofre" }] }),
  component: PropertiesGate,
});

function PropertiesGate() {
  const canView = useCan("viewAll");
  if (!canView) return <RestrictedArea />;
  return <PropertiesPage />;
}

type Form = {
  name: string; type: string; status: string; purpose: string; profile_id: string;
  address: string; city: string; state: string; cep: string;
  registration: string; cartorio: string;
  owner_name: string; owner_tax_id: string;
  acquisition_date: string; acquisition_value: string; market_value: string;
  cover_url: string; notes: string;
};

const emptyForm: Form = {
  name: "", type: "casa", status: "proprio", purpose: "moradia", profile_id: "",
  address: "", city: "", state: "", cep: "",
  registration: "", cartorio: "",
  owner_name: "", owner_tax_id: "",
  acquisition_date: "", acquisition_value: "", market_value: "",
  cover_url: "", notes: "",
};

const STATUS_TONE: Record<string, string> = {
  proprio: "bg-success text-success-foreground",
  alugado: "bg-primary text-primary-foreground",
  em_reforma: "bg-yellow-500 text-white",
  vendido: "bg-muted text-muted-foreground",
  em_aquisicao: "bg-accent text-accent-foreground",
  em_inventario: "bg-orange-500 text-white",
  arquivado: "bg-secondary text-secondary-foreground",
  desocupado: "bg-slate-500 text-white",
  em_uso_familiar: "bg-emerald-600 text-white",
  comodato: "bg-indigo-500 text-white",
  a_venda: "bg-blue-600 text-white",
  em_leilao: "bg-rose-600 text-white",
  documentacao_pendente: "bg-amber-600 text-white",
  outro: "bg-secondary text-secondary-foreground",
};

async function logAudit(action: string, entityId: string, note: string, old_value?: any, new_value?: any) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("audit_logs").insert({
      user_id: u.user.id, action, entity: "property", entity_id: entityId,
      note, old_value: old_value ?? null, new_value: new_value ?? null,
    } as any);
  } catch { /* silent */ }
}

function PropertiesPage() {
  const qc = useQueryClient();
  const canManage = useCan("manageEntities");
  const canDelete = useCan("deleteData");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fProfile, setFProfile] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fType, setFType] = useState("all");
  const [fCity, setFCity] = useState("all");

  const profiles = useQuery({ queryKey: ["profiles"], staleTime: 1000 * 60 * 30, queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });

  const list = useQuery({
    queryKey: ["properties"],
    staleTime: 1000 * 60 * 10, // Cache de 10 min
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*, profile:financial_profiles!properties_profile_id_fkey(name, color)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      return data;
    },
  });

  const totals = useQuery({
    queryKey: ["properties-totals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("property_id, amount, transaction_type")
        .eq("status", "approved")
        .not("property_id", "is", null);
      if (error) throw error;
      const map = new Map<string, { spent: number; invested: number }>();
      for (const r of data as any[]) {
        const key = r.property_id as string;
        const cur = map.get(key) ?? { spent: 0, invested: 0 };
        if (r.transaction_type === "investimento") cur.invested += Number(r.amount ?? 0);
        else cur.spent += Number(r.amount ?? 0);
        map.set(key, cur);
      }
      return map;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...form,
        type: form.type as any,
        status: form.status as any,
        purpose: (form.purpose || null) as any,
        profile_id: form.profile_id || null,
        acquisition_date: form.acquisition_date || null,
        acquisition_value: centsToNumber(parseBrlAmountToCents(form.acquisition_value)),
        market_value: centsToNumber(parseBrlAmountToCents(form.market_value)),
        cover_url: form.cover_url || null,
      };
      if (editId) {
        const { error } = await supabase.from("properties").update(payload).eq("id", editId);
        if (error) throw error;
        await logAudit("updated", editId, `Imóvel "${form.name}" editado`, null, payload);
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase.from("properties").insert({ ...payload, user_id: u.user!.id }).select("id").single();
      if (error) throw error;
      if (inserted) await logAudit("created", inserted.id, `Imóvel "${form.name}" criado`, null, payload);
    },
    onSuccess: () => {
      toast.success(editId ? "Imóvel atualizado" : "Imóvel cadastrado");
      setOpen(false); setEditId(null); setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async (p: any) => {
      const { error } = await supabase.from("properties").update({ status: "arquivado" as any }).eq("id", p.id);
      if (error) throw error;
      await logAudit("archived", p.id, `Imóvel "${p.name}" arquivado`);
    },
    onSuccess: () => { toast.success("Imóvel arquivado"); qc.invalidateQueries({ queryKey: ["properties"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (p: any) => {
      const { error } = await supabase.from("properties").delete().eq("id", p.id);
      if (error) throw error;
      await logAudit("deleted", p.id, `Imóvel "${p.name}" excluído`);
    },
    onSuccess: () => { toast.success("Imóvel excluído"); qc.invalidateQueries({ queryKey: ["properties"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Trava contra duplo clique / ações concorrentes nos cartões de imóvel.
  const busy = save.isPending || archive.isPending || remove.isPending;

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name ?? "", type: p.type ?? "casa", status: p.status ?? "proprio",
      purpose: p.purpose ?? "moradia", profile_id: p.profile_id ?? "",
      address: p.address ?? "", city: p.city ?? "", state: p.state ?? "", cep: p.cep ?? "",
      registration: p.registration ?? "", cartorio: p.cartorio ?? "",
      owner_name: p.owner_name ?? "", owner_tax_id: p.owner_tax_id ?? "",
      acquisition_date: p.acquisition_date ?? "",
      acquisition_value: p.acquisition_value != null ? String(p.acquisition_value) : "",
      market_value: (p as any).market_value != null ? String((p as any).market_value) : "",
      cover_url: p.cover_url ?? "", notes: p.notes ?? "",
    });
    setOpen(true);
  };

  const cities = useMemo(() => {
    const s = new Set<string>();
    (list.data ?? []).forEach((p: any) => p.city && s.add(p.city));
    return Array.from(s).sort();
  }, [list.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((p: any) => {
      if (fProfile !== "all" && p.profile_id !== fProfile) return false;
      if (fStatus !== "all" && p.status !== fStatus) return false;
      if (fType !== "all" && p.type !== fType) return false;
      if (fCity !== "all" && p.city !== fCity) return false;
      if (!term) return true;
      return [p.name, p.address, p.city, p.registration, p.owner_name].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(term));
    });
  }, [list.data, q, fProfile, fStatus, fType, fCity]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Imóveis</h1>
          <p className="text-sm text-muted-foreground">Seu patrimônio imobiliário organizado — gastos, investimentos e comprovantes por imóvel.</p>
        </div>
        {canManage && <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button variant="premium"><Plus className="h-4 w-4" /> Novo imóvel</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Editar imóvel" : "Novo imóvel"}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); if (save.isPending) return; save.mutate(); }} className="space-y-6">
              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados básicos</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Nome do imóvel</Label>
                    <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Apto Vila Nova" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(propertyTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(propertyStatusLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Finalidade</Label>
                    <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{Object.entries(propertyPurposeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Perfil vinculado</Label>
                    <Select value={form.profile_id || "none"} onValueChange={(v) => setForm({ ...form, profile_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Localização</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Endereço</Label>
                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} placeholder="SP" />
                  </div>
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} placeholder="00000-000" />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados patrimoniais</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Matrícula (opcional)</Label>
                    <Input value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cartório (opcional)</Label>
                    <Input value={form.cartorio} onChange={(e) => setForm({ ...form, cartorio: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Proprietário</Label>
                    <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF/CNPJ do proprietário</Label>
                    <Input value={form.owner_tax_id} onChange={(e) => setForm({ ...form, owner_tax_id: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de aquisição</Label>
                    <Input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor de aquisição (R$)</Label>
                    <Input inputMode="decimal" value={form.acquisition_value} onChange={(e) => setForm({ ...form, acquisition_value: e.target.value })} placeholder="0,00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor do imóvel (R$)</Label>
                    <Input inputMode="decimal" value={form.market_value} onChange={(e) => setForm({ ...form, market_value: e.target.value })} placeholder="0,00" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>URL da foto (opcional)</Label>
                    <Input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="https://…" />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</p>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </section>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="premium" disabled={save.isPending || !form.name}>{save.isPending ? "Salvando…" : editId ? "Salvar" : "Cadastrar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, endereço, matrícula…" className="pl-9" />
          </div>
          <Select value={fProfile} onValueChange={setFProfile}>
            <SelectTrigger><SelectValue placeholder="Perfil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(propertyStatusLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(propertyTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          {cities.length > 0 && (
            <Select value={fCity} onValueChange={setFCity}>
              <SelectTrigger className="md:col-start-5"><SelectValue placeholder="Cidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as cidades</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </Card>

      {list.isLoading ? (
        <LoadingState label="Carregando imóveis…" />
      ) : list.isError ? (
        <ErrorState
          error={list.error}
          onRetry={() => list.refetch()}
          retrying={list.isFetching}
          title="Não foi possível carregar os imóveis"
        />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum imóvel cadastrado"
          description="Cadastre um imóvel para acompanhar despesas, reformas, locações e investimentos."
        />
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p: any) => {
            const t = totals.data?.get(p.id) ?? { spent: 0, invested: 0 };
            return (
              <Card key={p.id} className="overflow-hidden">
                {p.cover_url ? (
                  <div className="h-32 w-full bg-muted" style={{ backgroundImage: `url(${p.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                ) : (
                  <div className="h-2" style={{ background: p.financial_profiles?.color ?? "#1e3a8a" }} />
                )}
                <div className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                        <Home className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{propertyTypeLabel[p.type] ?? p.type}</p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 ${STATUS_TONE[p.status] ?? "bg-secondary text-secondary-foreground"}`}>{propertyStatusLabel[p.status] ?? p.status}</Badge>
                  </div>
                  {(p.address || p.city) && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="min-w-0 truncate">{[p.address, p.city, p.state].filter(Boolean).join(", ")}</span>
                    </p>
                  )}
                  {p.financial_profiles?.name && <p className="mt-1 text-xs text-muted-foreground">Perfil: {p.financial_profiles.name}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Gasto</p>
                      <p className="text-sm font-semibold">{currencyBRL(t.spent)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Investido</p>
                      <p className="text-sm font-semibold">{currencyBRL(t.invested)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <Button asChild size="sm" variant="premium" className="min-w-0">
                      <Link to="/app/properties/$id" params={{ id: p.id }}>
                        <span>Ver detalhes</span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <div className="flex flex-wrap gap-1">
                      {canManage && <Button size="sm" variant="ghost" disabled={busy} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>}
                      {canManage && p.status !== "arquivado" && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (busy) return; archive.mutate(p); }} title="Arquivar"><Archive className="h-4 w-4" /></Button>
                      )}
                      {canDelete && <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" disabled={busy} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir "{p.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>Os comprovantes vinculados perdem apenas o vínculo com o imóvel — não são excluídos.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction disabled={remove.isPending} onClick={(e) => { e.preventDefault(); if (busy) return; remove.mutate(p); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Home className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum imóvel encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou cadastre um novo imóvel para acompanhar despesas, reformas e investimentos.</p>
        </Card>
      )}
    </div>
  );
}