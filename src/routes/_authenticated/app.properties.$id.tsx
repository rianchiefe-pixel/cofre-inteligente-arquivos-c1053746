import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { currencyBRL, dateBR, propertyPurposeLabel, propertyStatusLabel, propertyTypeLabel, transactionTypeLabel } from "@/lib/format";
import { ArrowLeft, Wallet, PiggyBank, Repeat, Wind, MapPin, Home, FileText, Landmark, KeyRound, ListTodo, Receipt, Users } from "lucide-react";
import { useCan } from "@/lib/permissions";
import { ExportMenu } from "@/components/export-menu";
import type { ReportPayload } from "@/lib/exports";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid, LineChart, Line,
} from "recharts";
import { LeaseTab, ObligationsTab, CredentialsTab, PropertyTasksTab } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/app/properties/$id")({
  head: () => ({ meta: [{ title: "Imóvel — Meu Cofre" }] }),
  component: PropertyDetail,
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
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function PropertyDetail() {
  const { id } = Route.useParams();
  const canExport = useCan("exportReports");
  const [userId, setUserId] = useState<string>("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? "")); }, []);

  const property = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*, profile:financial_profiles!properties_profile_id_fkey(*)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const categories = useQuery({
    queryKey: ["categories-all"],
    queryFn: async () => (await supabase.from("categories").select("id, name")).data ?? [],
  });

  const receipts = useQuery({
    queryKey: ["property-receipts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("id, amount, status, transaction_type, payment_date, bank_name, category_id")
        .eq("property_id", id)
        .eq("status", "approved")
        .order("payment_date", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const rows = receipts.data ?? [];
  const totalSpent = rows.filter((r: any) => r.transaction_type !== "investimento").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const totalInvested = rows.filter((r: any) => r.transaction_type === "investimento").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const totalFixed = rows.filter((r: any) => r.transaction_type === "gasto_fixo").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const totalVariable = rows.filter((r: any) => r.transaction_type === "gasto_variavel").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

  const byCategory = useMemo(() => Object.entries(
    rows.reduce<Record<string, number>>((acc: Record<string, number>, r: any) => {
      const cat = categories.data?.find((c: any) => c.id === r.category_id);
      const name = cat?.name ?? "Sem categoria";
      acc[name] = (acc[name] ?? 0) + Number(r.amount ?? 0);
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6), [rows, categories.data]);

  const byMonth = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows as any[]) {
      if (!r.payment_date) continue;
      const d = new Date(r.payment_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[key] = (map[key] ?? 0) + Number(r.amount ?? 0);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
  }, [rows]);

  const byBank = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows as any[]) {
      const key = r.bank_name || "Sem banco";
      map[key] = (map[key] ?? 0) + Number(r.amount ?? 0);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const topExpenses = useMemo(
    () => [...(rows as any[])].sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0)).slice(0, 5),
    [rows],
  );

  const buildPayload = (): ReportPayload => {
    const bp: any = (property.data as any)?.profile;
    const brand = bp ? {
      displayName: bp.display_name ?? bp.name,
      legalName: bp.legal_name, taxId: bp.tax_id, address: bp.address,
      phone: bp.phone, email: bp.email, logoUrl: bp.logo_url,
      primaryColor: bp.primary_color ?? bp.color,
      secondaryColor: bp.secondary_color, accentColor: bp.accent_color,
      footerText: bp.footer_text,
    } : null;
    return {
    title: "Relatório do Imóvel",
    subtitle: property.data?.name ?? "",
    filters: { propertyId: id },
    brand,
    summary: [
      { label: "Total gasto", value: currencyBRL(totalSpent) },
      { label: "Total investido", value: currencyBRL(totalInvested) },
      { label: "Despesas fixas", value: currencyBRL(totalFixed) },
      { label: "Despesas variáveis", value: currencyBRL(totalVariable) },
      { label: "Comprovantes", value: String(rows.length) },
    ],
    breakdowns: [
      { title: "Por categoria", rows: byCategory.map((c) => ({ name: c.name, value: currencyBRL(c.value) })) },
      { title: "Por banco", rows: byBank.map((c) => ({ name: c.name, value: currencyBRL(c.value) })) },
    ],
    columns: [
      { header: "Data", key: "payment_date", get: (r: any) => dateBR(r.payment_date), width: 12 },
      { header: "Valor", key: "amount", get: (r: any) => currencyBRL(Number(r.amount ?? 0)), width: 14 },
      { header: "Categoria", key: "category", get: (r: any) => categories.data?.find((c: any) => c.id === r.category_id)?.name ?? "", width: 18 },
      { header: "Tipo", key: "type", get: (r: any) => transactionTypeLabel[r.transaction_type as string] ?? "", width: 14 },
      { header: "Banco", key: "bank", get: (r: any) => r.bank_name ?? "", width: 16 },
    ],
    rows,
    filename: `imovel-${(property.data?.name ?? id).toString().toLowerCase().replace(/\s+/g, "-")}`,
    reportKind: "imovel",
    };
  };

  if (property.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!property.data) return <p className="text-sm text-muted-foreground">Imóvel não encontrado.</p>;

  const p = property.data;

  return (
    <div className="space-y-6">
      {p.cover_url && (
        <div className="h-48 w-full overflow-hidden rounded-2xl bg-muted" style={{ backgroundImage: `url(${p.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link to="/app/properties"><ArrowLeft className="h-4 w-4" /> Voltar</Link></Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Home className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{p.name}</h1>
            <Badge variant="secondary">{propertyStatusLabel[p.status] ?? p.status}</Badge>
            <Badge variant="outline">{propertyTypeLabel[p.type] ?? p.type}</Badge>
            {p.purpose && <Badge variant="outline">{propertyPurposeLabel[p.purpose] ?? p.purpose}</Badge>}
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            {(p.address || p.city) && <><MapPin className="h-3 w-3" /> {[p.address, p.city, p.state].filter(Boolean).join(", ")}</>}
          </p>
          {(p.owner_name || p.acquisition_date || p.acquisition_value) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {p.owner_name && <>Proprietário: {p.owner_name}</>}
              {p.acquisition_date && <> • Aquisição: {dateBR(p.acquisition_date)}</>}
              {p.acquisition_value != null && <> • Valor: {currencyBRL(Number(p.acquisition_value))}</>}
              {(p as any).market_value != null && <> • Valor de mercado: {currencyBRL(Number((p as any).market_value))}</>}
            </p>
          )}
        </div>
        {canExport && <ExportMenu build={buildPayload} disabled={rows.length === 0} label="Relatório do imóvel" />}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="overview"><Landmark className="mr-1.5 h-4 w-4" /> Visão geral</TabsTrigger>
          {p.status === "alugado" && <TabsTrigger value="lease"><Users className="mr-1.5 h-4 w-4" /> Locação</TabsTrigger>}
          <TabsTrigger value="obligations"><Receipt className="mr-1.5 h-4 w-4" /> Obrigações</TabsTrigger>
          <TabsTrigger value="accesses"><KeyRound className="mr-1.5 h-4 w-4" /> Acessos</TabsTrigger>
          <TabsTrigger value="tasks"><ListTodo className="mr-1.5 h-4 w-4" /> Tarefas</TabsTrigger>
          <TabsTrigger value="documents"><FileText className="mr-1.5 h-4 w-4" /> Documentos</TabsTrigger>
          <TabsTrigger value="expenses"><Wallet className="mr-1.5 h-4 w-4" /> Despesas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total gasto" value={currencyBRL(totalSpent)} icon={Wallet} />
        <StatCard label="Total investido" value={currencyBRL(totalInvested)} icon={PiggyBank} tone="success" />
        <StatCard label="Despesas fixas" value={currencyBRL(totalFixed)} icon={Repeat} tone="gold" />
        <StatCard label="Despesas variáveis" value={currencyBRL(totalVariable)} icon={Wind} tone="warn" />
        <StatCard label="Comprovantes" value={String(rows.length)} icon={FileText} />
      </div>

      {(byBank.length > 0 || topExpenses.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4" /> Por banco</h2>
            {byBank.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p> : (
              <div className="divide-y divide-border">
                {byBank.slice(0, 6).map((b) => (
                  <div key={b.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate text-muted-foreground">{b.name}</span>
                    <span className="font-semibold">{currencyBRL(b.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">Maiores gastos</h2>
            {topExpenses.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p> : (
              <div className="divide-y divide-border">
                {topExpenses.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate text-muted-foreground">{categories.data?.find((c: any) => c.id === r.category_id)?.name ?? "Sem categoria"} · {dateBR(r.payment_date)}</span>
                    <span className="font-semibold">{currencyBRL(Number(r.amount ?? 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Gastos por categoria</h2>
          {byCategory.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem dados ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={90} label={(d: any) => d.name}>
                  {byCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => currencyBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Evolução mensal</h2>
          {byMonth.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem dados ainda.</p>
          ) : byMonth.length === 1 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => currencyBRL(v)} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="hsl(var(--chart-2))" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => currencyBRL(v)} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-2))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">Comprovantes vinculados</h2>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum comprovante aprovado vinculado a este imóvel ainda. Vincule na tela de <Link to="/app/vault" className="text-primary underline">conferência</Link>.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {(rows as any[]).slice(0, 30).map((r) => (
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{categories.data?.find((c: any) => c.id === r.category_id)?.name ?? "Sem categoria"}</p>
                  <p className="truncate text-xs text-muted-foreground">{dateBR(r.payment_date)} • {r.bank_name ?? "—"} • {transactionTypeLabel[r.transaction_type as string] ?? "—"}</p>
                </div>
                <p className="text-sm font-semibold text-foreground">{currencyBRL(Number(r.amount ?? 0))}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {p.notes && (
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold">Observações</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.notes}</p>
        </Card>
      )}
        </TabsContent>

        {p.status === "alugado" && userId && (
          <TabsContent value="lease"><LeaseTab propertyId={id} userId={userId} /></TabsContent>
        )}
        {userId && <TabsContent value="obligations"><ObligationsTab propertyId={id} userId={userId} /></TabsContent>}
        {userId && <TabsContent value="accesses"><CredentialsTab propertyId={id} userId={userId} /></TabsContent>}
        {userId && <TabsContent value="tasks"><PropertyTasksTab propertyId={id} userId={userId} /></TabsContent>}
        {userId && <TabsContent value="documents"><Card><CardContent className="p-8 text-center text-muted-foreground">Gestão de documentos em desenvolvimento.</CardContent></Card></TabsContent>}
        {userId && (
          <TabsContent value="expenses" className="space-y-6">
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold">Despesas Vinculadas</h2>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma despesa aprovada vinculada.</p>
              ) : (
                <div className="divide-y divide-border">
                  {rows.map((r: any) => (
                    <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{categories.data?.find((c: any) => c.id === r.category_id)?.name ?? "Sem categoria"}</p>
                        <p className="truncate text-xs text-muted-foreground">{dateBR(r.payment_date)} • {r.bank_name ?? "—"}</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{currencyBRL(Number(r.amount ?? 0))}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}