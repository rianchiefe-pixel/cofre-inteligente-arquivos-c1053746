import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
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
import { propertyStatusLabel, propertyTypeLabel } from "@/lib/format";
import { Home, Plus, Pencil, Trash2, MapPin, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/properties")({
  head: () => ({ meta: [{ title: "Imóveis — Meu Cofre" }] }),
  component: PropertiesPage,
});

type Form = {
  name: string;
  type: string;
  status: string;
  profile_id: string;
  address: string;
  city: string;
  state: string;
  registration: string;
  owner_name: string;
  notes: string;
};

const emptyForm: Form = {
  name: "", type: "casa", status: "proprio", profile_id: "",
  address: "", city: "", state: "", registration: "", owner_name: "", notes: "",
};

function PropertiesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });

  const list = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*, financial_profiles(name, color)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form, type: form.type as any, status: form.status as any, profile_id: form.profile_id || null };
      if (editId) {
        const { error } = await supabase.from("properties").update(payload).eq("id", editId);
        if (error) throw error;
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("properties").insert({ ...payload, user_id: u.user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editId ? "Imóvel atualizado" : "Imóvel cadastrado");
      setOpen(false); setEditId(null); setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Imóvel excluído"); qc.invalidateQueries({ queryKey: ["properties"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name ?? "", type: p.type ?? "casa", status: p.status ?? "proprio",
      profile_id: p.profile_id ?? "", address: p.address ?? "", city: p.city ?? "",
      state: p.state ?? "", registration: p.registration ?? "",
      owner_name: p.owner_name ?? "", notes: p.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Imóveis</h1>
          <p className="text-sm text-muted-foreground">Cadastre casas, apartamentos, terrenos ou salas comerciais e vincule despesas e comprovantes.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button variant="premium"><Plus className="h-4 w-4" /> Novo imóvel</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editId ? "Editar imóvel" : "Novo imóvel"}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
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
                <div className="space-y-2 sm:col-span-2">
                  <Label>Perfil vinculado</Label>
                  <Select value={form.profile_id || "none"} onValueChange={(v) => setForm({ ...form, profile_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
                  <Label>Matrícula (opcional)</Label>
                  <Input value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Proprietário</Label>
                  <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="premium" disabled={save.isPending}>{editId ? "Salvar" : "Cadastrar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.data && list.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((p: any) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="h-2" style={{ background: p.financial_profiles?.color ?? "#1e3a8a" }} />
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
                  <Badge variant="secondary" className="shrink-0">{propertyStatusLabel[p.status] ?? p.status}</Badge>
                </div>
                {(p.address || p.city) && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="min-w-0 truncate">{[p.address, p.city, p.state].filter(Boolean).join(", ")}</span>
                  </p>
                )}
                {p.owner_name && <p className="mt-1 text-xs text-muted-foreground">Proprietário: {p.owner_name}</p>}
                {p.financial_profiles?.name && <p className="mt-1 text-xs text-muted-foreground">Perfil: {p.financial_profiles.name}</p>}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/properties/$id" params={{ id: p.id }}>Ver detalhes <ChevronRight className="h-4 w-4" /></Link>
                  </Button>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir "{p.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>Os comprovantes vinculados perdem apenas o vínculo com o imóvel — não são excluídos.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Home className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum imóvel cadastrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Cadastre um imóvel para acompanhar reformas, IPTU, condomínio e mais.</p>
        </Card>
      )}
    </div>
  );
}