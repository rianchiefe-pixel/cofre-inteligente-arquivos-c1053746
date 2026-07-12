import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currencyBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Wallet, PiggyBank, FileStack, AlertTriangle, TrendingUp, Clock, XCircle, Copy, Home, Building2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Dashboard — Meu Cofre" }] }),
  component: Dashboard,
});

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function StatCard({ label, value, icon: Icon, tone = "primary" }: { label: string; value: string; icon: any; tone?: "primary" | "gold" | "success" | "warn" }) {
  const tones: Record<string, string> = {
    primary: "bg-[image:var(--gradient-primary)] text-primary-foreground",
    gold: "bg-[image:var(--gradient-gold)] text-accent-foreground",
    success: "bg-success text-success-foreground",
    warn: "bg-destructive text-destructive-foreground",
  };
  return (
    <Card className="premium-card group relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[image:var(--gradient-primary)] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-10" />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)" }}>{value}</p>
        </div>
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-[var(--shadow-soft)] transition-transform duration-500 group-hover:scale-105 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function Dashboard() {
  const [propertyId, setPropertyId] = useState<string>("all");
  const [profileId, setProfileId] = useState<string>("all");

  const properties = useQuery({ queryKey: ["properties"], queryFn: async () => (await supabase.from("properties").select("id, name, status").order("name")).data ?? [] });
  const profilesList = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });

  const { data } = useQuery({
    queryKey: ["dashboard", propertyId, profileId],
    queryFn: async () => {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      let rq = supabase.from("receipts").select("id, amount, status, transaction_type, payment_date, bank_name, category_id, created_at, categories(name), profile_id, financial_profiles(name), property_id, properties(name)");
      if (propertyId !== "all") rq = rq.eq("property_id", propertyId);
      if (profileId !== "all") rq = rq.eq("profile_id", profileId);
      const [receipts, profiles, banks] = await Promise.all([
        rq,
        supabase.from("financial_profiles").select("id"),
        supabase.from("banks").select("id"),
      ]);
      return {
        receipts: receipts.data ?? [],
        profiles: profiles.data ?? [],
        banks: banks.data ?? [],
        monthStart: start,
      };
    },
  });

  const receipts = data?.receipts ?? [];
  const monthStart = data?.monthStart ?? new Date();
  // Regra 10: rejeitados e duplicados NÃO entram nos totais do dashboard.
  const validReceipts = receipts.filter((r) => r.status !== "rejected" && r.status !== "duplicate");
  const approvedReceipts = validReceipts.filter((r) => r.status === "approved");
  const monthReceipts = approvedReceipts.filter((r) => r.payment_date && new Date(r.payment_date) >= monthStart);
  const totalMonth = monthReceipts.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const totalInvested = monthReceipts.filter((r) => r.transaction_type === "investimento").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const pending = receipts.filter((r) => r.status === "pending").length;
  const duplicates = receipts.filter((r) => r.status === "duplicate").length;
  const rejectedMonth = receipts.filter((r) => r.status === "rejected" && r.created_at && new Date(r.created_at) >= monthStart).length;
  const approvedMonth = monthReceipts.length;

  // Property metrics (respect current profile filter, ignore property filter for aggregates)
  const activeProperties = (properties.data ?? []).filter((p: any) => p.status !== "arquivado" && p.status !== "vendido").length;
  const propertyIdToName = new Map<string, string>((properties.data ?? []).map((p: any) => [p.id, p.name]));
  const monthByProperty = new Map<string, number>();
  let totalInvestedProperties = 0;
  for (const r of monthReceipts as any[]) {
    if (!r.property_id) continue;
    monthByProperty.set(r.property_id, (monthByProperty.get(r.property_id) ?? 0) + Number(r.amount ?? 0));
    if (r.transaction_type === "investimento") totalInvestedProperties += Number(r.amount ?? 0);
  }
  let topPropertyName = "—";
  let topPropertyAmount = 0;
  for (const [pid, amt] of monthByProperty) {
    if (amt > topPropertyAmount) { topPropertyAmount = amt; topPropertyName = propertyIdToName.get(pid) ?? "—"; }
  }

  const byCategory = Object.entries(
    monthReceipts.reduce<Record<string, number>>((acc, r) => {
      const name = (r as any).categories?.name ?? "Sem categoria";
      acc[name] = (acc[name] ?? 0) + Number(r.amount ?? 0);
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  const byBank = Object.entries(
    monthReceipts.reduce<Record<string, number>>((acc, r) => {
      const name = r.bank_name ?? "Sem banco";
      acc[name] = (acc[name] ?? 0) + Number(r.amount ?? 0);
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value })).slice(0, 6);

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Meu Cofre</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground md:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Visão geral do seu cofre — mês atual.</p>
      </header>

      <Card className="premium-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Filtrar por perfil</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                {(profilesList.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Filtrar por imóvel</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os imóveis</SelectItem>
                {(properties.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gasto no mês" value={currencyBRL(totalMonth)} icon={Wallet} />
        <StatCard label="Investido no mês" value={currencyBRL(totalInvested)} icon={PiggyBank} tone="success" />
        <StatCard label="Comprovantes aprovados" value={String(approvedReceipts.length)} icon={FileStack} tone="gold" />
        <StatCard label={pending > 0 ? "Pendentes de conferência" : "Possíveis duplicados"} value={String(pending || duplicates)} icon={AlertTriangle} tone={pending > 0 ? "warn" : "primary"} />
      </div>

      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pendentes de aprovação" value={String(pending)} icon={Clock} tone="warn" />
        <StatCard label="Possíveis duplicidades" value={String(duplicates)} icon={Copy} tone="gold" />
        <StatCard label="Rejeitados no mês" value={String(rejectedMonth)} icon={XCircle} tone="warn" />
        <StatCard label="Aprovados no mês" value={String(approvedMonth)} icon={FileStack} tone="success" />
      </div>

      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Imóveis ativos" value={String(activeProperties)} icon={Home} />
        <StatCard label="Imóvel com maior gasto no mês" value={topPropertyAmount > 0 ? `${topPropertyName} · ${currencyBRL(topPropertyAmount)}` : "—"} icon={Building2} tone="gold" />
        <StatCard label="Investido em imóveis (mês)" value={currencyBRL(totalInvestedProperties)} icon={PiggyBank} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="premium-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Gastos por categoria (mês)</h2>
          </div>
          {byCategory.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem dados neste mês ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => currencyBRL(v)} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {byCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="premium-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Gastos por banco (mês)</h2>
          </div>
          {byBank.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem dados neste mês ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byBank} dataKey="value" nameKey="name" outerRadius={90} label={(d) => d.name}>
                  {byBank.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => currencyBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="premium-card p-5">
        <h2 className="mb-4 text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Últimos comprovantes</h2>
        {validReceipts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Envie seu primeiro comprovante pela aba <strong>Enviar comprovantes</strong>.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {validReceipts.slice(0, 8).map((r) => (
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-lg">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{(r as any).recipient_name || (r as any).description || "Comprovante"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {(r as any).categories?.name ?? "Sem categoria"} • {r.bank_name ?? "Sem banco"} • {(r as any).financial_profiles?.name ?? "—"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">{currencyBRL(Number(r.amount ?? 0))}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}