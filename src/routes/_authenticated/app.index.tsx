import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currencyBRL } from "@/lib/format";
import { allTimeRange, isWithinRange, monthRange, monthsBackRange } from "@/lib/date-range";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Wallet, PiggyBank, FileStack, AlertTriangle, TrendingUp, Clock, XCircle, Copy, Home, Building2, RefreshCw } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Meu Cofre" },
      { name: "description", content: "Visão geral do mês: gastos, investimentos, comprovantes pendentes e desempenho por imóvel." },
      { property: "og:title", content: "Dashboard — Meu Cofre" },
      { property: "og:description", content: "Acompanhe os indicadores financeiros do seu cofre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = [
  "oklch(0.42 0.11 162)",
  "oklch(0.76 0.12 86)",
  "oklch(0.58 0.14 190)",
  "oklch(0.62 0.18 40)",
  "oklch(0.55 0.14 310)",
  "oklch(0.66 0.15 145)",
  "oklch(0.6 0.16 20)",
  "oklch(0.52 0.13 255)",
];

function ChartTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item.value ?? 0);
  const share = total ? (value / total) * 100 : 0;
  return (
    <div className="rounded-xl border border-border/70 bg-popover/95 px-3 py-2 shadow-[var(--shadow-elegant)] backdrop-blur">
      <p className="flex items-center gap-2 text-xs font-medium text-popover-foreground">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.payload?.fill ?? item.color }} />
        {item.payload?.name}
      </p>
      <p className="mt-1 text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>{currencyBRL(value)}</p>
      <p className="text-[11px] text-muted-foreground">{share.toFixed(1)}% do período</p>
    </div>
  );
}


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
  const [period, setPeriod] = useState<"current" | "3m" | "12m" | "all">("12m");
  const periodLabel =
    period === "current" ? "mês atual" : period === "3m" ? "últimos 3 meses" : period === "12m" ? "últimos 12 meses" : "todo o período";

  const properties = useQuery({ queryKey: ["properties"], staleTime: 1000 * 60 * 30, queryFn: async () => (await supabase.from("properties").select("id, name, status").order("name")).data ?? [] });
  const profilesList = useQuery({ queryKey: ["profiles"], staleTime: 1000 * 60 * 30, queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });


  const dashboard = useQuery({
    queryKey: ["dashboard", propertyId, profileId, period],
    staleTime: 1000 * 60 * 5, // Cache de 5 minutos
    queryFn: async () => {
      const range =
        period === "current" ? monthRange() : period === "3m" ? monthsBackRange(3) : period === "12m" ? monthsBackRange(12) : allTimeRange();
      
      let rq = supabase
        .from("receipts")
        .select(
          "id, amount, status, transaction_type, payment_date, bank_name, category_id, created_at, recipient_name, description, category:categories!receipts_category_id_fkey(name), profile_id, property_id, properties(name)",
        )
        .order("payment_date", { ascending: false })
        .order("id", { ascending: true });

      if (propertyId !== "all") rq = rq.eq("property_id", propertyId);
      if (profileId !== "all") rq = rq.eq("profile_id", profileId);
      
      // Otimização: Limitar volume de dados para dashboard se o período for grande
      if (period === "all") rq = rq.limit(5000);

      const { data, error } = await rq;
      if (error) throw new Error(error.message);
      
      return { receipts: data ?? [], range };
    },
  });


  const receipts = (dashboard.data?.receipts ?? []) as any[];
  const range = dashboard.data?.range ?? monthsBackRange(12);
  // Regra 10: rejeitados e duplicados NÃO entram nos totais do dashboard.
  const validReceipts = receipts.filter((r) => r.status !== "rejected" && r.status !== "duplicate");
  const approvedReceipts = validReceipts.filter((r) => r.status === "approved");
  const monthReceipts = approvedReceipts.filter((r) => isWithinRange(r.payment_date, range.from, range.to));
  // Regra explícita: investimento NÃO entra em "gasto do mês".
  const totalInvested = monthReceipts.filter((r) => r.transaction_type === "investimento").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const totalMonth = monthReceipts.reduce((s, r) => s + Number(r.amount ?? 0), 0) - totalInvested;
  const pending = receipts.filter((r) => r.status === "pending").length;
  const duplicates = receipts.filter((r) => r.status === "duplicate").length;
  const rejectedMonth = receipts.filter((r) => r.status === "rejected" && isWithinRange(r.created_at, range.from, range.to)).length;
  const approvedMonth = monthReceipts.length;

  // Property metrics (respect current profile filter, ignore property filter for aggregates)
  const activeProperties = (properties.data ?? []).filter((p: any) => p.status !== "arquivado" && p.status !== "vendido").length;
  const profileIdToName = new Map<string, string>((profilesList.data ?? []).map((p: any) => [p.id, p.name]));
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
      const name = (r as any).category?.name ?? "Sem categoria";
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
        <p className="mt-1 text-sm text-muted-foreground">Visão geral do seu cofre — {periodLabel}.</p>
      </header>

      <Card className="premium-card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Mês atual</SelectItem>
                <SelectItem value="3m">Últimos 3 meses</SelectItem>
                <SelectItem value="12m">Últimos 12 meses</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

      {dashboard.isError && (
        <Card className="grid gap-3 border-destructive/40 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <p className="text-sm text-destructive">
            Não foi possível carregar os dados do dashboard: {(dashboard.error as any)?.message ?? "erro desconhecido"}. Os números abaixo não são confiáveis.
          </p>
          <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>
        </Card>
      )}

      {dashboard.isLoading && <p className="text-sm text-muted-foreground">Carregando indicadores do período…</p>}

      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Gasto no período (${periodLabel}, sem investimentos)`} value={currencyBRL(totalMonth)} icon={Wallet} />
        <StatCard label={`Investido (${periodLabel})`} value={currencyBRL(totalInvested)} icon={PiggyBank} tone="success" />
        <StatCard label="Comprovantes aprovados" value={String(approvedReceipts.length)} icon={FileStack} tone="gold" />
        <StatCard label={pending > 0 ? "Pendentes de conferência" : "Possíveis duplicados"} value={String(pending || duplicates)} icon={AlertTriangle} tone={pending > 0 ? "warn" : "primary"} />
      </div>

      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pendentes de aprovação" value={String(pending)} icon={Clock} tone="warn" />
        <StatCard label="Possíveis duplicidades" value={String(duplicates)} icon={Copy} tone="gold" />
        <StatCard label="Rejeitados no período" value={String(rejectedMonth)} icon={XCircle} tone="warn" />
        <StatCard label="Aprovados no período" value={String(approvedMonth)} icon={FileStack} tone="success" />
      </div>

      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Imóveis ativos" value={String(activeProperties)} icon={Home} />
        <StatCard label="Imóvel com maior gasto no período" value={topPropertyAmount > 0 ? `${topPropertyName} · ${currencyBRL(topPropertyAmount)}` : "—"} icon={Building2} tone="gold" />
        <StatCard label="Investido em imóveis (período)" value={currencyBRL(totalInvestedProperties)} icon={PiggyBank} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="premium-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Gastos por categoria (período)</h2>
          </div>
          {byCategory.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem dados neste período ainda.</p>
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
            <h2 className="text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Gastos por banco (período)</h2>
          </div>
          {byBank.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem dados neste período ainda.</p>
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
                    {(r as any).category?.name ?? "Sem categoria"} • {r.bank_name ?? "Sem banco"} • {profileIdToName.get(r.profile_id) ?? "—"}
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