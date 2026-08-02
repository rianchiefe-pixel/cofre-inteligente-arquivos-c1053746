import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { accountTypeLabel } from "@/lib/format";
import { Plus, Landmark, Pencil, Trash2 } from "lucide-react";
import { LoadingState, ErrorState, EmptyState } from "@/components/query-states";

export const Route = createFileRoute("/_authenticated/app/banks")({
  head: () => ({
    meta: [
      { title: "Bancos e contas — Meu Cofre" },
      { name: "description", content: "Cadastre, edite e exclua bancos e contas com reatribuição segura de contas, cartões e comprovantes." },
      { property: "og:title", content: "Bancos e contas — Meu Cofre" },
      { property: "og:description", content: "Organize bancos e contas por perfil financeiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BanksPage,
});

const emptyBank = { name: "", profile_id: "", color: "#64748b", notes: "" };
const emptyAcc = { nickname: "", type: "corrente", bank_id: "", profile_id: "", agency: "", number: "", holder: "" };

function BanksPage() {
  const qc = useQueryClient();
  const [openBank, setOpenBank] = useState(false);
  const [openAcc, setOpenAcc] = useState(false);
  const [bankId, setBankId] = useState<string | null>(null);
  const [accId, setAccId] = useState<string | null>(null);
  const [bank, setBank] = useState({ ...emptyBank });
  const [acc, setAcc] = useState({ ...emptyAcc });
  const [removeBank, setRemoveBank] = useState<any | null>(null);
  const [removeAcc, setRemoveAcc] = useState<any | null>(null);
  const [reassign, setReassign] = useState("");

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const banks = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("*, financial_profiles(name)").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*, banks(name), financial_profiles(name)").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveBank = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("upsert_bank_rpc", {
        p_id: (bankId ?? null) as unknown as string,
        p_bank: { name: bank.name, profile_id: bank.profile_id, color: bank.color, notes: bank.notes || null },
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.bank_id) throw new Error("Banco não persistido");
    },
    onSuccess: () => {
      toast.success(bankId ? "Banco atualizado" : "Banco criado");
      setOpenBank(false); setBankId(null); setBank({ ...emptyBank });
      qc.invalidateQueries({ queryKey: ["banks"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveAcc = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("upsert_account_rpc", {
        p_id: (accId ?? null) as unknown as string,
        p_account: {
          nickname: acc.nickname, type: acc.type, bank_id: acc.bank_id || null, profile_id: acc.profile_id,
          agency: acc.agency || null, number: acc.number || null, holder: acc.holder || null,
        },
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.account_id) throw new Error("Conta não persistida");
    },
    onSuccess: () => {
      toast.success(accId ? "Conta atualizada" : "Conta criada");
      setOpenAcc(false); setAccId(null); setAcc({ ...emptyAcc });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteBank = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: string | null }) => {
      const { data, error } = await supabase.rpc("delete_bank_rpc", { p_id: id, p_reassign_to: (to ?? null) as unknown as string });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.deleted_id) throw new Error("Exclusão não confirmada");
      return row as any;
    },
    onSuccess: (row) => {
      toast.success(`Banco excluído. ${row.reassigned_accounts} conta(s), ${row.reassigned_cards} cartão(ões) e ${row.reassigned_receipts} comprovante(s) reatribuídos.`);
      setRemoveBank(null); setReassign("");
      qc.invalidateQueries({ queryKey: ["banks"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteAcc = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: string | null }) => {
      const { data, error } = await supabase.rpc("delete_account_rpc", { p_id: id, p_reassign_to: (to ?? null) as unknown as string });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.deleted_id) throw new Error("Exclusão não confirmada");
      return row as any;
    },
    onSuccess: (row) => {
      toast.success(`Conta excluída. ${row.reassigned_receipts} comprovante(s) reatribuídos.`);
      setRemoveAcc(null); setReassign("");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hasProfiles = (profiles.data ?? []).length > 0;
  const bankList = (banks.data ?? []) as any[];
  const accList = (accounts.data ?? []) as any[];
  const busy = saveBank.isPending || saveAcc.isPending || deleteBank.isPending || deleteAcc.isPending;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Bancos e contas</h1>
        <p className="text-sm text-muted-foreground">Cadastre bancos e contas dentro de cada perfil.</p>
      </div>

      {!hasProfiles && <Card className="p-6 text-sm text-muted-foreground">Crie um perfil primeiro em <strong>Perfis</strong>.</Card>}

      {(banks.isError || accounts.isError) && (
        <ErrorState
          error={banks.error ?? accounts.error}
          title="Não foi possível carregar bancos e contas"
          retrying={banks.isFetching || accounts.isFetching}
          onRetry={() => { banks.refetch(); accounts.refetch(); }}
        />
      )}

      <section>
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="text-lg font-semibold">Bancos</h2>
          <Button size="sm" variant="premium" disabled={!hasProfiles || busy} onClick={() => { setBankId(null); setBank({ ...emptyBank }); setOpenBank(true); }}>
            <Plus className="h-4 w-4" /> Novo banco
          </Button>
        </div>
        {banks.isLoading && <LoadingState label="Carregando bancos…" />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bankList.map((b: any) => (
            <Card key={b.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: b.color }}>
                <Landmark className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{b.name}</p>
                <p className="truncate text-xs text-muted-foreground">{b.financial_profiles?.name}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setBankId(b.id); setBank({ name: b.name, profile_id: b.profile_id, color: b.color ?? "#64748b", notes: b.notes ?? "" }); setOpenBank(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { setRemoveBank(b); setReassign(""); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          ))}
          {!banks.isLoading && !banks.isError && bankList.length === 0 && <EmptyState title="Nenhum banco cadastrado" description="Cadastre os bancos usados nos seus lançamentos." />}
        </div>
      </section>

      <section>
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="text-lg font-semibold">Contas</h2>
          <Button size="sm" variant="premium" disabled={bankList.length === 0 || busy} onClick={() => { setAccId(null); setAcc({ ...emptyAcc }); setOpenAcc(true); }}>
            <Plus className="h-4 w-4" /> Nova conta
          </Button>
        </div>
        {accounts.isLoading && <LoadingState label="Carregando contas…" />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accList.map((a: any) => (
            <Card key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{a.nickname}</p>
                <p className="text-xs text-muted-foreground">{accountTypeLabel[a.type] ?? a.type} • {a.banks?.name ?? "—"} • {a.financial_profiles?.name}</p>
                {(a.agency || a.number) && <p className="mt-1 text-xs text-muted-foreground">Ag {a.agency || "—"} / Cc {a.number || "—"}</p>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setAccId(a.id); setAcc({ nickname: a.nickname, type: a.type, bank_id: a.bank_id ?? "", profile_id: a.profile_id, agency: a.agency ?? "", number: a.number ?? "", holder: a.holder ?? "" }); setOpenAcc(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { setRemoveAcc(a); setReassign(""); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          ))}
          {!accounts.isLoading && !accounts.isError && accList.length === 0 && <EmptyState title="Nenhuma conta cadastrada" description="Vincule contas correntes, poupanças e investimentos aos seus bancos." />}
        </div>
      </section>

      <Dialog open={openBank} onOpenChange={(o) => { setOpenBank(o); if (!o) { setBankId(null); setBank({ ...emptyBank }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{bankId ? "Editar banco" : "Novo banco"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (busy) return; saveBank.mutate(); }} className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input required value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} placeholder="Ex.: Itaú" /></div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={bank.profile_id} onValueChange={(v) => setBank({ ...bank, profile_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Cor</Label><Input type="color" value={bank.color} onChange={(e) => setBank({ ...bank, color: e.target.value })} className="h-10 w-24 p-1" /></div>
            <div className="space-y-2"><Label>Observações</Label><Input value={bank.notes} onChange={(e) => setBank({ ...bank, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpenBank(false)}>Cancelar</Button>
              <Button type="submit" variant="premium" disabled={saveBank.isPending || !bank.profile_id || !bank.name}>Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openAcc} onOpenChange={(o) => { setOpenAcc(o); if (!o) { setAccId(null); setAcc({ ...emptyAcc }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{accId ? "Editar conta" : "Nova conta"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (busy) return; saveAcc.mutate(); }} className="space-y-4">
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
                <Select value={acc.profile_id} onValueChange={(v) => setAcc({ ...acc, profile_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Banco</Label>
              <Select value={acc.bank_id} onValueChange={(v) => setAcc({ ...acc, bank_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{bankList.filter((b: any) => !acc.profile_id || b.profile_id === acc.profile_id).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><Label>Agência</Label><Input value={acc.agency} onChange={(e) => setAcc({ ...acc, agency: e.target.value })} /></div>
              <div className="space-y-2"><Label>Número</Label><Input value={acc.number} onChange={(e) => setAcc({ ...acc, number: e.target.value })} /></div>
              <div className="space-y-2"><Label>Titular</Label><Input value={acc.holder} onChange={(e) => setAcc({ ...acc, holder: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpenAcc(false)}>Cancelar</Button>
              <Button type="submit" variant="premium" disabled={saveAcc.isPending || !acc.profile_id || !acc.bank_id || !acc.nickname}>Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeBank} onOpenChange={(o) => { if (!o) { setRemoveBank(null); setReassign(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir banco</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Contas, cartões e comprovantes vinculados precisam de um banco de destino. Sem destino, a exclusão é bloqueada.</p>
            <div className="space-y-2">
              <Label>Reatribuir para</Label>
              <Select value={reassign} onValueChange={setReassign}>
                <SelectTrigger><SelectValue placeholder="Nenhum (bloquear se houver vínculos)" /></SelectTrigger>
                <SelectContent>{bankList.filter((b: any) => b.id !== removeBank?.id).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemoveBank(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={deleteBank.isPending} onClick={() => { if (busy) return; removeBank && deleteBank.mutate({ id: removeBank.id, to: reassign || null }); }}>Excluir</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeAcc} onOpenChange={(o) => { if (!o) { setRemoveAcc(null); setReassign(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir conta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Comprovantes vinculados precisam de uma conta de destino. Sem destino, a exclusão é bloqueada.</p>
            <div className="space-y-2">
              <Label>Reatribuir para</Label>
              <Select value={reassign} onValueChange={setReassign}>
                <SelectTrigger><SelectValue placeholder="Nenhuma (bloquear se houver vínculos)" /></SelectTrigger>
                <SelectContent>{accList.filter((a: any) => a.id !== removeAcc?.id).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemoveAcc(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={deleteAcc.isPending} onClick={() => { if (busy) return; removeAcc && deleteAcc.mutate({ id: removeAcc.id, to: reassign || null }); }}>Excluir</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
