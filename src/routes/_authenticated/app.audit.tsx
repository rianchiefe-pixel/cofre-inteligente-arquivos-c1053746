import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { Download, ShieldAlert, Search } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { RestrictedArea } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/app/audit")({
  head: () => ({ meta: [{ title: "Auditoria — Meu Cofre" }] }),
  component: AuditGate,
});

function AuditGate() {
  const canView = useCan("viewAudit");
  if (!canView) return <RestrictedArea message="Somente proprietário, administrador ou contador podem visualizar a auditoria." />;
  return <AuditPage />;
}

const ACTIONS: Record<string, { label: string; tone: string }> = {
  approved: { label: "Aprovado", tone: "bg-success text-success-foreground" },
  rejected: { label: "Rejeitado", tone: "bg-destructive text-destructive-foreground" },
  marked_duplicate: { label: "Duplicado", tone: "bg-accent text-accent-foreground" },
  bulk_approve: { label: "Aprovação em massa", tone: "bg-success text-success-foreground" },
  bulk_reject: { label: "Rejeição em massa", tone: "bg-destructive text-destructive-foreground" },
  bulk_duplicate: { label: "Duplicado em massa", tone: "bg-accent text-accent-foreground" },
  bulk_archive: { label: "Arquivado em massa", tone: "bg-muted text-foreground" },
  created: { label: "Criado", tone: "bg-primary text-primary-foreground" },
  updated: { label: "Editado", tone: "bg-secondary text-secondary-foreground" },
  deleted: { label: "Excluído", tone: "bg-destructive text-destructive-foreground" },
};

function fmtDateTime(s: string) {
  try { return new Date(s).toLocaleString("pt-BR"); } catch { return s; }
}

function AuditPage() {
  const canExport = useCan("exportReports");
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");
  const [profileId, setProfileId] = useState<string>("all");
  const [propertyId, setPropertyId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const properties = useQuery({ queryKey: ["properties"], queryFn: async () => (await supabase.from("properties").select("id, name").order("name")).data ?? [] });

  const logs = useQuery({
    queryKey: ["audit_logs", action, entity, profileId, propertyId, from, to],
    queryFn: async () => {
      let qb = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
      if (action !== "all") qb = qb.eq("action", action);
      if (entity !== "all") qb = qb.eq("entity", entity);
      if (profileId !== "all") qb = qb.eq("profile_id", profileId);
      if (propertyId !== "all") qb = qb.eq("property_id", propertyId);
      if (from) qb = qb.gte("created_at", new Date(from).toISOString());
      if (to) qb = qb.lte("created_at", new Date(to + "T23:59:59").toISOString());
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return logs.data ?? [];
    return (logs.data ?? []).filter((l: any) =>
      [l.action, l.entity, l.note, l.entity_id].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(term))
    );
  }, [q, logs.data]);

  const exportCSV = () => {
    if (!filtered.length) { toast.error("Nada para exportar"); return; }
    const rows = filtered.map((l: any) => ({
      data: fmtDateTime(l.created_at),
      acao: l.action,
      entidade: l.entity,
      entity_id: l.entity_id ?? "",
      perfil_id: l.profile_id ?? "",
      imovel_id: l.property_id ?? "",
      observacao: l.note ?? "",
      valor_anterior: JSON.stringify(l.old_value ?? ""),
      valor_novo: JSON.stringify(l.new_value ?? ""),
    }));
    const header = Object.keys(rows[0]).join(",");
    const body = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `auditoria-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Auditoria</h1>
          <p className="text-sm text-muted-foreground">Histórico completo de alterações no seu cofre.</p>
        </div>
        {canExport && <Button onClick={exportCSV} variant="outline"><Download className="h-4 w-4" /> Exportar CSV</Button>}
      </header>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ação, entidade, observação…" className="pl-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ação</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.keys(ACTIONS).map(k => <SelectItem key={k} value={k}>{ACTIONS[k].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entidade</Label>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="receipt">Comprovante</SelectItem>
                <SelectItem value="property">Imóvel</SelectItem>
                <SelectItem value="profile">Perfil</SelectItem>
                <SelectItem value="bank">Banco</SelectItem>
                <SelectItem value="account">Conta</SelectItem>
                <SelectItem value="card">Cartão</SelectItem>
                <SelectItem value="category">Categoria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Perfil</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Imóvel</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(properties.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">Nenhum evento encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">As alterações aparecem aqui automaticamente.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map((l: any) => {
              const meta = ACTIONS[l.action] ?? { label: l.action, tone: "bg-secondary text-foreground" };
              return (
                <div key={l.id} className="grid gap-2 px-4 py-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <Badge className={`${meta.tone} justify-self-start`}>{meta.label}</Badge>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.entity} {l.entity_id ? `· ${l.entity_id.slice(0,8)}` : ""}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.note ?? (l.new_value ? JSON.stringify(l.new_value) : "—")}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground md:text-right">{fmtDateTime(l.created_at)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}