import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, CreditCard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/cards")({
  head: () => ({ meta: [{ title: "Cartões — Meu Cofre" }] }),
  component: CardsPage,
});

const BRANDS = ["visa", "mastercard", "elo", "amex", "hipercard", "outro"];

function CardsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", brand: "visa", last4: "", closing_day: "", due_day: "", holder: "", profile_id: "", bank_id: "" });

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const banks = useQuery({ queryKey: ["banks"], queryFn: async () => (await supabase.from("banks").select("id, name, profile_id")).data ?? [] });
  const cards = useQuery({ queryKey: ["cards"], queryFn: async () => (await supabase.from("cards").select("*, banks(name), financial_profiles(name)").order("created_at")).data ?? [] });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload = { ...form, user_id: u.user!.id, closing_day: form.closing_day ? Number(form.closing_day) : null, due_day: form.due_day ? Number(form.due_day) : null };
      const { error } = await supabase.from("cards").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cartão criado"); setOpen(false); setForm({ name: "", brand: "visa", last4: "", closing_day: "", due_day: "", holder: "", profile_id: "", bank_id: "" }); qc.invalidateQueries({ queryKey: ["cards"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Cartões</h1><p className="text-sm text-muted-foreground">Cartões vinculados aos seus perfis.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="premium" disabled={(profiles.data ?? []).length === 0}><Plus className="h-4 w-4" /> Novo cartão</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cartão</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Nome</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Nubank Ultravioleta" /></div>
                <div className="space-y-2">
                  <Label>Bandeira</Label>
                  <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={form.profile_id} onValueChange={(v) => setForm({ ...form, profile_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Select value={form.bank_id} onValueChange={(v) => setForm({ ...form, bank_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(banks.data ?? []).filter((b: any) => !form.profile_id || b.profile_id === form.profile_id).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2"><Label>Final</Label><Input maxLength={4} value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value })} /></div>
                <div className="space-y-2"><Label>Fechamento</Label><Input type="number" min={1} max={31} value={form.closing_day} onChange={(e) => setForm({ ...form, closing_day: e.target.value })} /></div>
                <div className="space-y-2"><Label>Vencimento</Label><Input type="number" min={1} max={31} value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Titular</Label><Input value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" variant="premium" disabled={create.isPending || !form.profile_id}>Criar</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(cards.data ?? []).map((c: any) => (
          <Card key={c.id} className="overflow-hidden">
            <div className="bg-[image:var(--gradient-primary)] p-5 text-primary-foreground">
              <CreditCard className="h-6 w-6" />
              <p className="mt-6 font-mono tracking-wider">•••• •••• •••• {c.last4 ?? "0000"}</p>
              <p className="mt-3 text-xs uppercase opacity-80">{c.brand}</p>
            </div>
            <div className="p-4">
              <p className="font-medium text-foreground">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.banks?.name ?? "—"} • {c.financial_profiles?.name ?? "—"}</p>
              {(c.closing_day || c.due_day) && <p className="mt-1 text-xs text-muted-foreground">Fech. {c.closing_day ?? "—"} / Venc. {c.due_day ?? "—"}</p>}
            </div>
          </Card>
        ))}
        {(cards.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum cartão cadastrado.</p>}
      </div>
    </div>
  );
}