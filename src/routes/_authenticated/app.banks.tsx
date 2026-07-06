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
import { accountTypeLabel } from "@/lib/format";
import { Plus, Landmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/banks")({
  head: () => ({ meta: [{ title: "Bancos e contas — Meu Cofre" }] }),
  component: BanksPage,
});

function BanksPage() {
  const qc = useQueryClient();
  const [openBank, setOpenBank] = useState(false);
  const [openAcc, setOpenAcc] = useState(false);
  const [bank, setBank] = useState({ name: "", profile_id: "", color: "#64748b" });
  const [acc, setAcc] = useState({ nickname: "", type: "corrente", bank_id: "", profile_id: "", agency: "", number: "", holder: "" });

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const banks = useQuery({ queryKey: ["banks"], queryFn: async () => (await supabase.from("banks").select("*, financial_profiles(name)").order("created_at")).data ?? [] });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: async () => (await supabase.from("accounts").select("*, banks(name), financial_profiles(name)").order("created_at")).data ?? [] });

  const createBank = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("banks").insert({ ...bank, user_id: u.user!.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Banco criado"); setOpenBank(false); setBank({ name: "", profile_id: "", color: "#64748b" }); qc.invalidateQueries({ queryKey: ["banks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const createAcc = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("accounts").insert({ ...acc, type: acc.type as any, user_id: u.user!.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conta criada"); setOpenAcc(false); setAcc({ nickname: "", type: "corrente", bank_id: "", profile_id: "", agency: "", number: "", holder: "" }); qc.invalidateQueries({ queryKey: ["accounts"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const hasProfiles = (profiles.data ?? []).length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Bancos e contas</h1>
        <p className="text-sm text-muted-foreground">Cadastre bancos e contas dentro de cada perfil.</p>
      </div>

      {!hasProfiles && (
        <Card className="p-6 text-sm text-muted-foreground">
          Crie um perfil primeiro em <strong>Perfis</strong>.
        </Card>
      )}

      <section>
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="text-lg font-semibold">Bancos</h2>
          <Dialog open={openBank} onOpenChange={setOpenBank}>
            <DialogTrigger asChild><Button size="sm" variant="premium" disabled={!hasProfiles}><Plus className="h-4 w-4" /> Novo banco</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo banco</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createBank.mutate(); }} className="space-y-4">
                <div className="space-y-2"><Label>Nome</Label><Input required value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} placeholder="Ex.: Itaú" /></div>
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={bank.profile_id} onValueChange={(v) => setBank({ ...bank, profile_id: v })} required>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Cor</Label><Input type="color" value={bank.color} onChange={(e) => setBank({ ...bank, color: e.target.value })} className="h-10 w-24 p-1" /></div>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpenBank(false)}>Cancelar</Button><Button type="submit" variant="premium" disabled={createBank.isPending || !bank.profile_id}>Criar</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(banks.data ?? []).map((b: any) => (
            <Card key={b.id} className="flex items-center gap-3 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: b.color }}>
                <Landmark className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{b.name}</p>
                <p className="truncate text-xs text-muted-foreground">{b.financial_profiles?.name}</p>
              </div>
            </Card>
          ))}
          {(banks.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum banco cadastrado.</p>}
        </div>
      </section>

      <section>
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="text-lg font-semibold">Contas</h2>
          <Dialog open={openAcc} onOpenChange={setOpenAcc}>
            <DialogTrigger asChild><Button size="sm" variant="premium" disabled={(banks.data ?? []).length === 0}><Plus className="h-4 w-4" /> Nova conta</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createAcc.mutate(); }} className="space-y-4">
                <div className="space-y-2"><Label>Apelido</Label><Input required value={acc.nickname} onChange={(e) => setAcc({ ...acc, nickname: e.target.value })} placeholder="Ex.: Conta principal" /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={acc.type} onValueChange={(v) => setAcc({ ...acc, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(accountTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Perfil</Label>
                    <Select value={acc.profile_id} onValueChange={(v) => setAcc({ ...acc, profile_id: v })} required>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Select value={acc.bank_id} onValueChange={(v) => setAcc({ ...acc, bank_id: v })} required>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(banks.data ?? []).filter((b: any) => !acc.profile_id || b.profile_id === acc.profile_id).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label>Agência</Label><Input value={acc.agency} onChange={(e) => setAcc({ ...acc, agency: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Número</Label><Input value={acc.number} onChange={(e) => setAcc({ ...acc, number: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Titular</Label><Input value={acc.holder} onChange={(e) => setAcc({ ...acc, holder: e.target.value })} /></div>
                </div>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpenAcc(false)}>Cancelar</Button><Button type="submit" variant="premium" disabled={createAcc.isPending || !acc.profile_id || !acc.bank_id}>Criar</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(accounts.data ?? []).map((a: any) => (
            <Card key={a.id} className="p-4">
              <p className="font-medium text-foreground">{a.nickname}</p>
              <p className="text-xs text-muted-foreground">{accountTypeLabel[a.type] ?? a.type} • {a.banks?.name ?? "—"} • {a.financial_profiles?.name}</p>
              {(a.agency || a.number) && <p className="mt-1 text-xs text-muted-foreground">Ag {a.agency || "—"} / Cc {a.number || "—"}</p>}
            </Card>
          ))}
          {(accounts.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>}
        </div>
      </section>
    </div>
  );
}