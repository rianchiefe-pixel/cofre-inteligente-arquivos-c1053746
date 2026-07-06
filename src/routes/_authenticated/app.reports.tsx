import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currencyBRL, dateBR, transactionTypeLabel } from "@/lib/format";
import { Download } from "lucide-react";
import { useCan } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "Relatórios — Meu Cofre" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const canExport = useCan("exportReports");
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [profileId, setProfileId] = useState("all");
  const [type, setType] = useState("all");
  const [propertyId, setPropertyId] = useState("all");

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const properties = useQuery({ queryKey: ["properties"], queryFn: async () => (await supabase.from("properties").select("id, name").order("name")).data ?? [] });

  const data = useQuery({
    queryKey: ["report", from, to, profileId, type, propertyId],
    queryFn: async () => {
      let q = supabase.from("receipts").select("*, categories(name), financial_profiles(name), properties(name)").eq("status", "approved").order("payment_date", { ascending: false });
      if (from) q = q.gte("payment_date", from);
      if (to) q = q.lte("payment_date", to);
      if (profileId !== "all") q = q.eq("profile_id", profileId);
      if (type !== "all") q = q.eq("transaction_type", type as any);
      if (propertyId !== "all") q = q.eq("property_id", propertyId);
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const rows = data.data ?? [];
  const total = useMemo(() => rows.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0), [rows]);

  const exportCsv = () => {
    const header = ["Data", "Valor", "Destinatário", "Categoria", "Banco", "Perfil", "Imóvel", "Tipo", "Método", "Descrição"].join(";");
    const lines = rows.map((r: any) => [
      dateBR(r.payment_date),
      String(Number(r.amount ?? 0)).replace(".", ","),
      r.recipient_name ?? "",
      r.categories?.name ?? "",
      r.bank_name ?? "",
      r.financial_profiles?.name ?? "",
      r.properties?.name ?? "",
      transactionTypeLabel[r.transaction_type as string] ?? "",
      r.payment_method ?? "",
      (r.description ?? "").replaceAll(";", ","),
    ].join(";"));
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `meu-cofre-${from}-a-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Filtre e exporte comprovantes aprovados.</p>
      </div>

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-6 md:items-end">
          <div className="space-y-2"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-2"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Perfil</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Imóvel</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(properties.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(transactionTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {canExport && <Button variant="premium" onClick={exportCsv} disabled={rows.length === 0}><Download className="h-4 w-4" /> Exportar CSV</Button>}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="p-5"><p className="text-xs uppercase text-muted-foreground">Total</p><p className="mt-2 text-2xl font-bold">{currencyBRL(total)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase text-muted-foreground">Comprovantes</p><p className="mt-2 text-2xl font-bold">{rows.length}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase text-muted-foreground">Ticket médio</p><p className="mt-2 text-2xl font-bold">{currencyBRL(rows.length ? total / rows.length : 0)}</p></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Destinatário</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Banco</th>
                <th className="px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-3">{dateBR(r.payment_date)}</td>
                  <td className="px-4 py-3">{r.recipient_name ?? "—"}</td>
                  <td className="px-4 py-3">{r.categories?.name ?? "—"}</td>
                  <td className="px-4 py-3">{r.financial_profiles?.name ?? "—"}</td>
                  <td className="px-4 py-3">{r.bank_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{currencyBRL(Number(r.amount ?? 0))}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum registro nos filtros atuais.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}