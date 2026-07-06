import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { profileTypeLabel } from "@/lib/format";
import { Plus, Building2, Pencil, Trash2 } from "lucide-react";
import { useCan } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/app/profiles")({
  head: () => ({ meta: [{ title: "Perfis — Meu Cofre" }] }),
  component: ProfilesPage,
});

function ProfilesPage() {
  const qc = useQueryClient();
  const canManage = useCan("manageEntities");
  const canDelete = useCan("deleteData");
  const [open, setOpen] = useState(false);
  const emptyForm = { name: "", type: "pessoa_fisica", tax_id: "", color: "#1e3a8a", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_profiles").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("financial_profiles").update({ ...form, type: form.type as any }).eq("id", editId);
        if (error) throw error;
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("financial_profiles").insert({ ...form, user_id: u.user!.id, type: form.type as any });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editId ? "Perfil atualizado" : "Perfil criado");
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Perfil excluído"); qc.invalidateQueries({ queryKey: ["profiles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name ?? "", type: p.type ?? "pessoa_fisica", tax_id: p.tax_id ?? "", color: p.color ?? "#1e3a8a", notes: p.notes ?? "" });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Perfis financeiros</h1>
          <p className="text-sm text-muted-foreground">Pessoal, empresa, holding, imóvel — cada perfil tem seu próprio cofre.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditId(null); setForm(emptyForm); } }}>
          {canManage && <DialogTrigger asChild>
            <Button variant="premium"><Plus className="h-4 w-4" /> Novo perfil</Button>
          </DialogTrigger>}
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar perfil" : "Novo perfil"}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Holding Familiar" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(profileTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>CPF / CNPJ (opcional)</Label>
                  <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-24 p-1" />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="premium" disabled={create.isPending}>{editId ? "Salvar" : "Criar perfil"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : data && data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="h-2" style={{ background: p.color ?? "#1e3a8a" }} />
              <div className="p-5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{profileTypeLabel[p.type as string] ?? p.type}</p>
                  </div>
                </div>
                {p.tax_id && <p className="text-xs text-muted-foreground">CPF/CNPJ: {p.tax_id}</p>}
                {p.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.notes}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  {canManage && <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /> Editar</Button>}
                  {canDelete && <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> Excluir</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir perfil "{p.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Comprovantes, bancos e cartões vinculados a este perfil também podem ser afetados. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum perfil ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">Crie perfis para separar pessoa física, empresas, holdings ou imóveis.</p>
        </Card>
      )}
    </div>
  );
}