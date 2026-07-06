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
import { Plus, Building2, Pencil, Trash2, Upload, X, Image as ImageIcon } from "lucide-react";
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
  const emptyForm = {
    name: "", type: "pessoa_fisica", tax_id: "", color: "#1e3a8a", notes: "",
    display_name: "", legal_name: "", address: "", phone: "", email: "",
    primary_color: "#0f2044", secondary_color: "#1e3a8a", accent_color: "#bf953f",
    footer_text: "", logo_url: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

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
      const payload = { ...form, type: form.type as any };
      if (editId) {
        const before = (data ?? []).find((p) => p.id === editId);
        const { error } = await supabase.from("financial_profiles").update(payload).eq("id", editId);
        if (error) throw error;
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          await supabase.from("audit_logs").insert({
            user_id: u.user.id, action: "updated", entity: "profile", entity_id: editId,
            profile_id: editId, old_value: before as any, new_value: payload as any,
            note: "Identidade visual/perfil atualizado",
          });
        }
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("financial_profiles").insert({ ...payload, user_id: u.user!.id });
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
    setForm({
      name: p.name ?? "", type: p.type ?? "pessoa_fisica", tax_id: p.tax_id ?? "",
      color: p.color ?? "#1e3a8a", notes: p.notes ?? "",
      display_name: p.display_name ?? "", legal_name: p.legal_name ?? "",
      address: p.address ?? "", phone: p.phone ?? "", email: p.email ?? "",
      primary_color: p.primary_color ?? p.color ?? "#0f2044",
      secondary_color: p.secondary_color ?? "#1e3a8a",
      accent_color: p.accent_color ?? "#bf953f",
      footer_text: p.footer_text ?? "", logo_url: p.logo_url ?? "",
    });
    setOpen(true);
  };

  const onLogoFile = async (file: File | null) => {
    if (!file) return;
    const ALLOWED = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!ALLOWED.includes(file.type)) { toast.error("Formato inválido. Use PNG, JPG, SVG ou WebP."); return; }
    if (file.size > 512 * 1024) { toast.error("Logo excede 512KB."); return; }
    setLogoUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("Falha ao ler arquivo"));
        r.readAsDataURL(file);
      });
      setForm((f) => ({ ...f, logo_url: dataUrl }));
      toast.success("Logo carregada. Clique em salvar para aplicar.");
    } catch (e: any) { toast.error(e.message); }
    finally { setLogoUploading(false); }
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
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Identidade visual</h3>
                  <p className="text-xs text-muted-foreground">Aparece nos relatórios PDF e Excel deste perfil.</p>
                </div>
                <div className="space-y-2">
                  <Label>Logo (PNG, JPG, SVG · máx. 512KB)</Label>
                  <div className="flex items-center gap-3">
                    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background">
                      {form.logo_url ? (
                        <img src={form.logo_url} alt="logo" className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex">
                        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)} />
                        <Button asChild type="button" variant="outline" size="sm"><span><Upload className="h-4 w-4" /> {logoUploading ? "Carregando…" : form.logo_url ? "Substituir" : "Enviar logo"}</span></Button>
                      </label>
                      {form.logo_url && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, logo_url: "" })}>
                          <X className="h-4 w-4" /> Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nome de exibição</Label>
                  <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Ex.: Família Silva Holding" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Cor principal</Label>
                    <Input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value, color: e.target.value })} className="h-10 w-full p-1" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Secundária</Label>
                    <Input type="color" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="h-10 w-full p-1" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Destaque</Label>
                    <Input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-10 w-full p-1" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">Razão social</Label><Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Endereço</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label className="text-xs">E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rodapé dos relatórios</Label>
                  <Textarea rows={2} value={form.footer_text} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} placeholder="Ex.: Relatório confidencial — Holding Silva · contato@silva.com" />
                </div>

                {/* Preview */}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Prévia do cabeçalho</p>
                  <div className="overflow-hidden rounded-lg border" style={{ background: form.primary_color }}>
                    <div className="flex items-center gap-3 p-3 text-white">
                      {form.logo_url ? (
                        <img src={form.logo_url} alt="logo" className="h-10 w-10 rounded bg-white/10 object-contain p-1" />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded bg-white/10"><Building2 className="h-5 w-5" /></div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider opacity-80">{(form.display_name || form.name || "MEU COFRE").toUpperCase()}</p>
                        <p className="truncate text-sm font-bold">Relatório Financeiro</p>
                      </div>
                    </div>
                    <div className="h-1" style={{ background: form.accent_color }} />
                  </div>
                </div>
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
              <div className="h-2" style={{ background: (p as any).primary_color ?? p.color ?? "#1e3a8a" }} />
              <div className="p-5">
                <div className="mb-3 flex items-center gap-3">
                  {(p as any).logo_url ? (
                    <img src={(p as any).logo_url} alt={p.name} className="h-10 w-10 rounded-xl border object-contain" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                      <Building2 className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{(p as any).display_name || p.name}</p>
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