/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FilterX,
  Loader2,
  Plus,
  Search,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProfile } from "@/hooks/use-active-profile";
import {
  filterForecast,
  getForecast,
  type ForecastItem,
  type ForecastKind,
} from "@/lib/forecast-engine";
import { currencyBRL, dateBR, paymentMethodLabel } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/forecast")({
  head: () => ({
    meta: [
      { title: "Previsibilidade Financeira — Meu Cofre" },
      {
        name: "description",
        content: "Projeção consolidada dos próximos compromissos financeiros.",
      },
    ],
  }),
  component: ForecastPage,
});

const sb = supabase as any;
const KIND_LABEL: Record<ForecastKind, string> = {
  fixed: "Gastos fixos",
  variable: "Gastos variáveis",
  expected: "Despesas previstas",
  investment: "Investimentos previstos",
};
const KIND_COLOR: Record<ForecastKind, string> = {
  fixed: "#2563eb",
  variable: "#f59e0b",
  expected: "#8b5cf6",
  investment: "#10b981",
};
const STATUS_LABEL = { confirmed: "Confirmado", estimated: "Estimado", manual: "Manual" } as const;
const SOURCE_LABEL: Record<string, string> = {
  obligation: "Obrigação",
  credit_card_installment: "Parcela",
  card_statement: "Fatura",
  future_receipt: "Lançamento futuro",
  history_estimate: "Histórico/Estimativa",
  manual: "Manual",
};
const money = (cents: number) => currencyBRL(cents / 100);
const iso = (date: Date) => format(date, "yyyy-MM-dd");
const monthName = (month: string, short = false) =>
  format(new Date(`${month}-01T12:00:00`), short ? "MMM" : "MMMM yyyy", { locale: ptBR }).replace(
    /^./,
    (c) => c.toUpperCase(),
  );
const shortMoney = (value: number) =>
  value >= 100000 ? `${currencyBRL(value / 100000).replace(",00", "")} mil` : money(value);

type Filters = {
  profileId: string;
  propertyId: string;
  categoryId: string;
  kind: string;
  sourceType: string;
  status: string;
  cardId: string;
  accountId: string;
  bankId: string;
  recipient: string;
};
const emptyFilters = (profileId?: string | null): Filters => ({
  profileId: profileId || "all",
  propertyId: "all",
  categoryId: "all",
  kind: "all",
  sourceType: "all",
  status: "all",
  cardId: "all",
  accountId: "all",
  bankId: "all",
  recipient: "all",
});

function ForecastPage() {
  const qc = useQueryClient();
  const { activeProfileId } = useActiveProfile();
  const [period, setPeriod] = useState("12");
  const [customStart, setCustomStart] = useState(iso(startOfMonth(new Date())));
  const [customEnd, setCustomEnd] = useState(iso(endOfMonth(addMonths(new Date(), 11))));
  const [filters, setFilters] = useState<Filters>(() => emptyFilters(activeProfileId));
  const [manualOpen, setManualOpen] = useState(false);
  const [drill, setDrill] = useState<{ title: string; items: ForecastItem[] } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [sort, setSort] = useState<"date" | "value" | "category" | "month">("date");
  const [page, setPage] = useState(1);

  useEffect(
    () => setFilters((f) => ({ ...f, profileId: activeProfileId || "all" })),
    [activeProfileId],
  );
  // Datas em edição podem ficar vazias/incompletas; sem sanitizar, a consulta quebra a tela.
  const defaultStart = iso(startOfMonth(new Date()));
  const isValidIsoDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
  const safeCustomStart = isValidIsoDate(customStart) ? customStart : defaultStart;
  const safeCustomEnd =
    isValidIsoDate(customEnd) && customEnd >= safeCustomStart
      ? customEnd
      : iso(endOfMonth(new Date(`${safeCustomStart}T12:00:00`)));
  const startDate = period === "custom" ? safeCustomStart : defaultStart;
  const endDate =
    period === "custom"
      ? safeCustomEnd
      : iso(endOfMonth(addMonths(new Date(), Number(period) - 1)));

  const source = useQuery({
    queryKey: ["financial-forecast-sources", startDate, endDate],
    staleTime: 30_000,
    queryFn: async () => {
      const historyStart = iso(startOfMonth(subMonths(new Date(`${startDate}T12:00:00`), 12)));
      const statementStart = iso(startOfMonth(subMonths(new Date(`${startDate}T12:00:00`), 24)));
      const [
        profiles,
        properties,
        categories,
        accounts,
        banks,
        cards,
        obligations,
        obligationCategories,
        statements,
        futureReceipts,
        fixed,
        history,
        manual,
      ] = await Promise.all([
        sb.from("financial_profiles").select("id,name,type").eq("archived", false).order("name"),
        sb.from("properties").select("id,name,profile_id").order("name"),
        sb.from("categories").select("id,name").eq("archived", false).order("name"),
        sb.from("accounts").select("id,nickname,profile_id,bank_id").order("nickname"),
        sb.from("banks").select("id,name,profile_id").order("name"),
        sb.from("cards").select("id,name,profile_id,bank_id,due_day,closing_day").order("name"),
        sb
          .from("property_obligations")
          .select("*, properties(id,name,profile_id)")
          .lte("due_date", endDate),
        sb
          .from("property_obligation_categories")
          .select("obligation_id,category_id,categories(name)"),
        sb
          .from("card_statements")
          .select("*")
          .gte("due_date", statementStart)
          .lte("due_date", endDate),
        sb
          .from("receipts")
          .select("*, category:categories!receipts_category_id_fkey(name)")
          .gte("payment_date", startDate)
          .lte("payment_date", endDate)
          .in("status", ["approved", "pending"]),
        sb
          .from("recurring_fixed_expenses")
          .select("*")
          .eq("active", true)
          .lte("start_month", endDate),
        sb
          .from("receipts")
          .select(
            "id,profile_id,property_id,category_id,recipient_name,description,payment_date,amount,status,duplicate_of,expense_behavior,transaction_type, category:categories!receipts_category_id_fkey(name)",
          )
          .eq("status", "approved")
          .gte("payment_date", historyStart)
          .lt("payment_date", startDate)
          .order("payment_date"),
        sb
          .from("financial_forecasts")
          .select("*")
          .lte("start_date", endDate)
          .neq("status", "cancelled"),
      ]);
      const responses = [
        profiles,
        properties,
        categories,
        accounts,
        banks,
        cards,
        obligations,
        obligationCategories,
        statements,
        futureReceipts,
        fixed,
        history,
        manual,
      ];
      const failure = responses.find((x) => x.error);
      if (failure?.error) throw failure.error;
      const statementIds = (statements.data ?? []).map((x: any) => x.id);
      let cardTransactions: any[] = [];
      if (statementIds.length) {
        const tx = await sb
          .from("card_transactions")
          .select("*")
          .in("statement_id", statementIds)
          .in("status", ["approved", "pending"]);
        if (tx.error) throw tx.error;
        cardTransactions = tx.data ?? [];
      }
      return {
        profiles: profiles.data ?? [],
        properties: properties.data ?? [],
        categories: categories.data ?? [],
        accounts: accounts.data ?? [],
        banks: banks.data ?? [],
        cards: cards.data ?? [],
        obligations: obligations.data ?? [],
        obligationCategories: obligationCategories.data ?? [],
        statements: statements.data ?? [],
        cardTransactions,
        futureReceipts: futureReceipts.data ?? [],
        recurringFixedExpenses: fixed.data ?? [],
        historicalReceipts: history.data ?? [],
        manualForecasts: manual.data ?? [],
        personalProfileId:
          (profiles.data ?? []).find((profile: any) => profile.type === "pessoa_fisica")?.id ??
          null,
      };
    },
  });

  const raw = useMemo(
    () => (source.data ? getForecast({ startDate, endDate, ...source.data }) : null),
    [source.data, startDate, endDate],
  );
  const result = useMemo(() => (raw ? filterForecast(raw, filters) : null), [raw, filters]);
  const labels = useMemo<{
    profiles: Map<string, string>;
    properties: Map<string, string>;
    categories: Map<string, string>;
    accounts: Map<string, string>;
  }>(
    () => ({
      profiles: new Map((source.data?.profiles ?? []).map((x: any) => [x.id, x.name])),
      properties: new Map((source.data?.properties ?? []).map((x: any) => [x.id, x.name])),
      categories: new Map((source.data?.categories ?? []).map((x: any) => [x.id, x.name])),
      accounts: new Map((source.data?.accounts ?? []).map((x: any) => [x.id, x.nickname])),
    }),
    [source.data],
  );

  const chartData = useMemo(
    () =>
      (result?.months ?? []).map((m) => ({
        month: m.month,
        label: monthName(m.month, true),
        fixed: m.byKind.fixed / 100,
        variable: m.byKind.variable / 100,
        expected: m.byKind.expected / 100,
        investment: m.byKind.investment / 100,
        total: m.totalCents / 100,
      })),
    [result],
  );
  const pieData = useMemo(
    () =>
      result
        ? (Object.keys(KIND_LABEL) as ForecastKind[])
            .map((kind) => ({ kind, name: KIND_LABEL[kind], value: result.totals[kind] / 100 }))
            .filter((x) => x.value > 0)
        : [],
    [result],
  );
  const peak = useMemo(
    () =>
      result?.months.reduce(
        (best, m) => (m.totalCents > (best?.totalCents ?? -1) ? m : best),
        result.months[0],
      ),
    [result],
  );
  const recipients = useMemo(
    () =>
      [...new Set((raw?.items ?? []).map((x) => x.recipient).filter(Boolean) as string[])].sort(),
    [raw],
  );
  const sortedItems = useMemo(
    () =>
      [...(result?.items ?? [])].sort((a, b) =>
        sort === "value"
          ? b.amountCents - a.amountCents
          : sort === "category"
            ? String(
                a.categoryName || labels.categories.get(a.categoryId || "") || "",
              ).localeCompare(
                String(b.categoryName || labels.categories.get(b.categoryId || "") || ""),
              )
            : sort === "month"
              ? a.month.localeCompare(b.month)
              : a.date.localeCompare(b.date),
      ),
    [result, sort, labels],
  );
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const visibleItems = sortedItems.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [filters, startDate, endDate, sort]);

  const openKind = (kind: ForecastKind, title = KIND_LABEL[kind]) =>
    result && setDrill({ title, items: result.items.filter((x) => x.kind === kind) });
  const generateReport = async () => {
    if (!result) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFontSize(18);
    doc.text("Relatório de Previsibilidade Financeira", 14, 18);
    doc.setFontSize(9);
    doc.text(
      `Período: ${dateBR(startDate)} a ${dateBR(endDate)}  |  Perfil: ${filters.profileId === "all" ? "Todos" : labels.profiles.get(filters.profileId) || "—"}  |  Imóvel: ${filters.propertyId === "all" ? "Todos" : labels.properties.get(filters.propertyId) || "—"}`,
      14,
      25,
    );
    doc.setFontSize(11);
    doc.text(`TOTAL PREVISTO NO PERÍODO: ${money(result.totals.total)}`, 14, 34);
    doc.setFontSize(9);
    doc.text(
      `Fixos: ${money(result.totals.fixed)}  |  Variáveis: ${money(result.totals.variable)}  |  Despesas/cartões: ${money(result.totals.expected)}  |  Investimentos: ${money(result.totals.investment)}  |  Manuais: ${money(result.totals.manual)}`,
      14,
      41,
    );
    autoTable(doc, {
      startY: 47,
      head: [["Data", "Descrição", "Tipo", "Perfil / Imóvel", "Origem", "Status", "Valor"]],
      body: result.items.map((x) => [
        dateBR(x.date),
        x.description,
        KIND_LABEL[x.kind],
        `${labels.profiles.get(x.profileId || "") || "—"} / ${labels.properties.get(x.propertyId || "") || "—"}`,
        x.originLabel,
        STATUS_LABEL[x.status],
        money(x.amountCents),
      ]),
      foot: [["", "TOTAL PREVISTO NO PERÍODO", "", "", "", "", money(result.totals.total)]],
      styles: { fontSize: 7 },
      headStyles: { fillColor: [20, 35, 55] },
    });
    doc.save(`Relatorio-Previsibilidade-${startDate}-a-${endDate}.pdf`);
    toast.success("Relatório gerado com os filtros ativos.");
  };

  if (source.isLoading) return <ForecastSkeleton />;
  if (source.isError)
    return (
      <Card className="p-8 text-center">
        <p className="font-semibold text-destructive">
          Não foi possível calcular a previsibilidade.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {source.error instanceof Error ? source.error.message : "Tente novamente."}
        </p>
        <Button className="mt-4" onClick={() => source.refetch()}>
          Tentar novamente
        </Button>
      </Card>
    );
  if (!result) return null;

  const nextMonth = result.months[1] ?? result.months[0];
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-accent">
            <TrendingUp className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[.18em]">Planejamento</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Previsibilidade Financeira
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Veja quanto está previsto para sair nos próximos meses e antecipe suas decisões
            financeiras.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={generateReport}>
            <FileDown className="mr-2 h-4 w-4" />
            Gerar relatório
          </Button>
          <Button onClick={() => setManualOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar previsão
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Período"
            value={period}
            onChange={setPeriod}
            options={[
              ["3", "Próximos 3 meses"],
              ["6", "Próximos 6 meses"],
              ["12", "Próximos 12 meses"],
              ["custom", "Personalizado"],
            ]}
          />
          {period === "custom" && (
            <>
              <div>
                <Label>De</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div>
                <Label>Até</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={customEnd}
                  min={customStart}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </>
          )}
          <FilterSelect
            label="Perfil"
            value={filters.profileId}
            onChange={(v) => setFilters({ ...filters, profileId: v, propertyId: "all" })}
            options={[
              ["all", "Todos os perfis"],
              ...(source.data?.profiles ?? []).map((x: any) => [x.id, x.name]),
            ]}
          />
          <FilterSelect
            label="Imóvel"
            value={filters.propertyId}
            onChange={(v) => setFilters({ ...filters, propertyId: v })}
            options={[
              ["all", "Todos os imóveis"],
              ...(source.data?.properties ?? [])
                .filter(
                  (x: any) => filters.profileId === "all" || x.profile_id === filters.profileId,
                )
                .map((x: any) => [x.id, x.name]),
            ]}
          />
          <div className="flex items-end">
            <Button
              className="w-full"
              variant="ghost"
              onClick={() => setFilters(emptyFilters(activeProfileId))}
            >
              <FilterX className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Tipo"
            value={filters.kind}
            onChange={(v) => setFilters({ ...filters, kind: v })}
            options={[["all", "Todos"], ...Object.entries(KIND_LABEL)]}
          />
          <FilterSelect
            label="Categoria"
            value={filters.categoryId}
            onChange={(v) => setFilters({ ...filters, categoryId: v })}
            options={[
              ["all", "Todas"],
              ...(source.data?.categories ?? []).map((x: any) => [x.id, x.name]),
            ]}
          />
          <FilterSelect
            label="Origem"
            value={filters.sourceType}
            onChange={(v) => setFilters({ ...filters, sourceType: v })}
            options={[["all", "Todas"], ...Object.entries(SOURCE_LABEL)]}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v })}
            options={[["all", "Todos"], ...Object.entries(STATUS_LABEL)]}
          />
          <FilterSelect
            label="Destinatário"
            value={filters.recipient}
            onChange={(v) => setFilters({ ...filters, recipient: v })}
            options={[["all", "Todos"], ...recipients.map((x) => [x, x])]}
          />
          <FilterSelect
            label="Cartão"
            value={filters.cardId}
            onChange={(v) => setFilters({ ...filters, cardId: v })}
            options={[
              ["all", "Todos"],
              ...(source.data?.cards ?? []).map((x: any) => [x.id, x.name]),
            ]}
          />
          <FilterSelect
            label="Conta"
            value={filters.accountId}
            onChange={(v) => setFilters({ ...filters, accountId: v })}
            options={[
              ["all", "Todas"],
              ...(source.data?.accounts ?? []).map((x: any) => [x.id, x.nickname]),
            ]}
          />
          <FilterSelect
            label="Banco"
            value={filters.bankId}
            onChange={(v) => setFilters({ ...filters, bankId: v })}
            options={[
              ["all", "Todos"],
              ...(source.data?.banks ?? []).map((x: any) => [x.id, x.name]),
            ]}
          />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <Metric
          title="Total previsto"
          value={result.totals.total}
          subtitle={`${result.items.length} compromissos`}
          onClick={() => setDrill({ title: "Total previsto", items: result.items })}
        />
        <Metric
          title="Próximo mês"
          value={nextMonth?.totalCents ?? 0}
          subtitle={nextMonth ? monthName(nextMonth.month) : "—"}
          onClick={() =>
            nextMonth && setDrill({ title: monthName(nextMonth.month), items: nextMonth.items })
          }
        />
        <Metric
          title="Gastos fixos"
          value={result.totals.fixed}
          onClick={() => openKind("fixed")}
          color="text-blue-600"
        />
        <Metric
          title="Gastos variáveis"
          value={result.totals.variable}
          onClick={() => openKind("variable")}
          color="text-amber-600"
        />
        <Metric
          title="Cartões / parcelas"
          value={result.totals.cards}
          onClick={() =>
            setDrill({
              title: "Cartões / parcelas",
              items: result.items.filter((x) =>
                ["credit_card_installment", "card_statement"].includes(x.sourceType),
              ),
            })
          }
          color="text-violet-600"
        />
        <Metric
          title="Obrigações"
          value={result.totals.obligations}
          onClick={() =>
            setDrill({
              title: "Obrigações",
              items: result.items.filter((x) => x.sourceType === "obligation"),
            })
          }
          color="text-rose-600"
        />
        <Metric
          title="Previsões manuais"
          value={result.totals.manual}
          subtitle={`${result.totals.manualCount} ocorrências`}
          onClick={() =>
            setDrill({
              title: "Previsões manuais",
              items: result.items.filter((x) => x.sourceType === "manual"),
            })
          }
          color="text-emerald-600"
        />
      </div>

      {!result.items.length ? (
        <Card className="grid min-h-56 place-items-center p-8 text-center">
          <div>
            <CalendarClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <h2 className="font-semibold">Nenhuma despesa prevista para este período.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste os filtros ou adicione uma previsão manual.
            </p>
            <Button className="mt-4" onClick={() => setManualOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar previsão
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="Previsão mensal"
              subtitle="Clique em um segmento para ver sua composição"
              className="xl:col-span-2"
            >
              <ResponsiveContainer width="100%" height={310}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => shortMoney(v * 100)} width={72} />
                  <Tooltip formatter={(v) => currencyBRL(Number(v))} />
                  <Legend />
                  {(Object.keys(KIND_LABEL) as ForecastKind[]).map((kind) => (
                    <Bar
                      key={kind}
                      dataKey={kind}
                      name={KIND_LABEL[kind]}
                      stackId="forecast"
                      fill={KIND_COLOR[kind]}
                      radius={kind === "investment" ? [4, 4, 0, 0] : 0}
                      onClick={(data: any) => {
                        const month = result.months.find((m) => m.month === data.month);
                        if (month)
                          setDrill({
                            title: `${KIND_LABEL[kind]} — ${monthName(month.month)}`,
                            items: month.items.filter((x) => x.kind === kind),
                          });
                      }}
                      className="cursor-pointer"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Composição do período" subtitle="Participação por classificação">
              <ResponsiveContainer width="100%" height={310}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={96}
                    paddingAngle={2}
                    onClick={(data: any) => openKind(data.kind)}
                    className="cursor-pointer"
                  >
                    {pieData.map((x) => (
                      <Cell key={x.kind} fill={KIND_COLOR[x.kind]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => currencyBRL(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <ChartCard
            title="Evolução da previsão"
            subtitle={
              peak
                ? `Pico em ${monthName(peak.month)}: ${money(peak.totalCents)}`
                : "Total previsto por mês"
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => shortMoney(v * 100)} width={72} />
                <Tooltip formatter={(v) => currencyBRL(Number(v))} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total previsto"
                  stroke="var(--primary)"
                  strokeWidth={3}
                  dot={(props: any) => (
                    <circle
                      {...props}
                      r={props.payload.month === peak?.month ? 7 : 4}
                      fill={props.payload.month === peak?.month ? "#ef4444" : "var(--primary)"}
                      onClick={() => {
                        const month = result.months.find((m) => m.month === props.payload.month);
                        if (month) setDrill({ title: monthName(month.month), items: month.items });
                      }}
                      className="cursor-pointer"
                    />
                  )}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card className="p-5">
            <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Previsão por mês</h2>
                <p className="text-sm text-muted-foreground">
                  Expanda qualquer mês para auditar os valores.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    const i = result.months.findIndex((m) => m.month === selectedMonth);
                    setSelectedMonth(
                      result.months[Math.max(0, i - 1)]?.month || result.months[0]?.month,
                    );
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select
                  value={selectedMonth || result.months[0]?.month}
                  onValueChange={setSelectedMonth}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {result.months.map((m) => (
                      <SelectItem key={m.month} value={m.month}>
                        {monthName(m.month)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    const i = result.months.findIndex(
                      (m) => m.month === (selectedMonth || result.months[0]?.month),
                    );
                    setSelectedMonth(
                      result.months[Math.min(result.months.length - 1, i + 1)]?.month,
                    );
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Accordion
              type="multiple"
              value={selectedMonth ? [selectedMonth] : undefined}
              onValueChange={(v) => setSelectedMonth(v.at(-1) || "")}
              className="grid gap-2 md:grid-cols-2"
            >
              {result.months.map((m) => (
                <AccordionItem key={m.month} value={m.month} className="rounded-lg border px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <span>
                      <span className="block font-semibold">{monthName(m.month)}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.items.length} registros
                      </span>
                    </span>
                    <strong className="ml-auto mr-3">{money(m.totalCents)}</strong>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {(Object.keys(KIND_LABEL) as ForecastKind[]).map((kind) => (
                        <button
                          key={kind}
                          className="rounded-md bg-muted/50 p-2 text-left hover:bg-muted"
                          onClick={() =>
                            setDrill({
                              title: `${KIND_LABEL[kind]} — ${monthName(m.month)}`,
                              items: m.items.filter((x) => x.kind === kind),
                            })
                          }
                        >
                          <span className="block text-[11px] text-muted-foreground">
                            {KIND_LABEL[kind]}
                          </span>
                          <strong>{money(m.byKind[kind])}</strong>
                        </button>
                      ))}
                    </div>
                    <DetailList
                      items={m.items}
                      labels={labels}
                      onSelect={(x) => setDrill({ title: x.description, items: [x] })}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Detalhamento</h2>
                <p className="text-sm text-muted-foreground">
                  A mesma base que alimenta cards, gráficos e relatório.
                </p>
              </div>
              <FilterSelect
                label="Ordenar"
                value={sort}
                onChange={(v) => setSort(v as any)}
                options={[
                  ["date", "Data"],
                  ["value", "Valor"],
                  ["category", "Categoria"],
                  ["month", "Mês"],
                ]}
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo / Status</TableHead>
                    <TableHead>Categoria / Destinatário</TableHead>
                    <TableHead>Perfil / Imóvel</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((x) => (
                    <TableRow
                      key={x.id}
                      className="cursor-pointer"
                      onClick={() => setDrill({ title: x.description, items: [x] })}
                    >
                      <TableCell className="whitespace-nowrap">{dateBR(x.date)}</TableCell>
                      <TableCell className="min-w-48 font-medium">{x.description}</TableCell>
                      <TableCell>
                        <span className="block text-xs">{KIND_LABEL[x.kind]}</span>
                        <StatusBadge status={x.status} />
                      </TableCell>
                      <TableCell>
                        <span className="block">
                          {x.categoryName || labels.categories.get(x.categoryId || "") || "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">{x.recipient || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="block">
                          {labels.profiles.get(x.profileId || "") || "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {labels.properties.get(x.propertyId || "") || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {paymentMethodLabel[x.paymentMethod || ""] ||
                          x.cardName ||
                          labels.accounts.get(x.accountId || "") ||
                          "—"}
                      </TableCell>
                      <TableCell>
                        {x.installmentCurrent
                          ? `${x.installmentCurrent}/${x.installmentTotal}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{SOURCE_LABEL[x.sourceType]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {money(x.amountCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t p-4 text-sm text-muted-foreground">
              <span>{sortedItems.length} registros</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <span>
                  {page} / {pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === pages}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      <ManualForecastDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        data={source.data!}
        initialProfileId={filters.profileId}
        onSaved={() => qc.invalidateQueries({ queryKey: ["financial-forecast-sources"] })}
      />
      <Drilldown drill={drill} onOpenChange={(open) => !open && setDrill(null)} labels={labels} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Metric({
  title,
  value,
  subtitle,
  onClick,
  color = "text-foreground",
}: {
  title: string;
  value: number;
  subtitle?: string;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <strong className={`mt-2 block text-xl ${color}`}>{money(value)}</strong>
      <span className="mt-1 block text-xs text-muted-foreground">
        {subtitle || "Clique para detalhar"}
      </span>
    </button>
  );
}
function ChartCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`min-w-0 p-5 ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </Card>
  );
}
function StatusBadge({ status }: { status: ForecastItem["status"] }) {
  return (
    <Badge
      variant={status === "confirmed" ? "default" : "outline"}
      className={
        status === "estimated"
          ? "border-amber-500 text-amber-700"
          : status === "manual"
            ? "border-emerald-500 text-emerald-700"
            : ""
      }
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}
function DetailList({
  items,
  labels,
  onSelect,
}: {
  items: ForecastItem[];
  labels: any;
  onSelect: (x: ForecastItem) => void;
}) {
  return (
    <div className="space-y-1">
      {items.length ? (
        items.map((x) => (
          <button
            key={x.id}
            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-muted"
            onClick={() => onSelect(x)}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{x.description}</span>
              <span className="text-xs text-muted-foreground">
                {dateBR(x.date)} ·{" "}
                {labels.properties.get(x.propertyId || "") || x.recipient || x.originLabel}
              </span>
            </span>
            <strong className="whitespace-nowrap">{money(x.amountCents)}</strong>
          </button>
        ))
      ) : (
        <p className="py-3 text-center text-sm text-muted-foreground">Sem valores neste mês.</p>
      )}
    </div>
  );
}

function Drilldown({
  drill,
  onOpenChange,
  labels,
}: {
  drill: { title: string; items: ForecastItem[] } | null;
  onOpenChange: (open: boolean) => void;
  labels: any;
}) {
  return (
    <Sheet open={!!drill} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{drill?.title}</SheetTitle>
          <SheetDescription>
            {drill?.items.length || 0} registros ·{" "}
            {money(drill?.items.reduce((s, x) => s + x.amountCents, 0) || 0)}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-3">
          {drill?.items.map((x) => (
            <Card key={x.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{x.description}</h3>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[x.kind]} · {dateBR(x.date)}
                  </p>
                </div>
                <strong>{money(x.amountCents)}</strong>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Info label="Status">
                  <StatusBadge status={x.status} />
                </Info>
                <Info label="Origem">{x.originLabel}</Info>
                <Info label="Categoria">
                  {x.categoryName || labels.categories.get(x.categoryId || "") || "—"}
                </Info>
                <Info label="Destinatário">{x.recipient || "—"}</Info>
                <Info label="Perfil">{labels.profiles.get(x.profileId || "") || "—"}</Info>
                <Info label="Imóvel">{labels.properties.get(x.propertyId || "") || "—"}</Info>
                <Info label="Pagamento">
                  {paymentMethodLabel[x.paymentMethod || ""] ||
                    x.cardName ||
                    labels.accounts.get(x.accountId || "") ||
                    "—"}
                </Info>
                <Info label="Parcela">
                  {x.installmentCurrent ? `${x.installmentCurrent}/${x.installmentTotal}` : "—"}
                </Info>
                <Info label="ID da origem">
                  <span className="break-all font-mono">{x.sourceId}</span>
                </Info>
                <Info label="Ocorrência">
                  <span className="font-mono">{x.sourceOccurrenceId}</span>
                </Info>
              </div>
              {x.originalPath && (
                <Button asChild variant="link" className="mt-2 h-auto p-0">
                  <Link to={x.originalPath as any}>Ver registro original</Link>
                </Button>
              )}
            </Card>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

const blankForm = {
  description: "",
  amount: "",
  start_date: "",
  end_date: "",
  kind: "expected",
  recurrence: "once",
  occurrence_count: "",
  profile_id: "none",
  property_id: "none",
  category_id: "none",
  recipient_name: "",
  payment_method: "none",
  account_id: "none",
  card_id: "none",
  last_installment_date: "",
  notes: "",
};

/** Nº de parcelas entre duas datas (inclusivo, base mensal). */
function installmentCount(start: string, last: string) {
  if (!start || !last) return null;
  const [ys, ms] = start.split("-").map(Number);
  const [yl, ml] = last.split("-").map(Number);
  if (!ys || !ms || !yl || !ml) return null;
  const diff = (yl - ys) * 12 + (ml - ms) + 1;
  return diff > 0 ? diff : null;
}

function ManualForecastDialog({
  open,
  onOpenChange,
  data,
  initialProfileId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: any;
  initialProfileId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    ...blankForm,
    profile_id: initialProfileId === "all" ? "none" : initialProfileId,
  });
  useEffect(() => {
    if (open)
      setForm({ ...blankForm, profile_id: initialProfileId === "all" ? "none" : initialProfileId });
  }, [open, initialProfileId]);
  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Não autenticado");
      const amount = Number(form.amount.replace(",", "."));
      if (!form.description.trim() || !amount || !form.start_date)
        throw new Error("Informe descrição, valor e data prevista.");
      const payload = {
        user_id: auth.user.id,
        description: form.description.trim(),
        amount,
        start_date: form.start_date,
        end_date: form.end_date || null,
        kind: form.kind,
        recurrence: form.recurrence,
      const isInstallment = form.payment_method === "credito_parcelado";
      const parcels = isInstallment
        ? installmentCount(form.start_date, form.last_installment_date)
        : null;
      if (isInstallment && form.last_installment_date && !parcels)
        throw new Error("A data da última parcela deve ser igual ou posterior à data inicial.");
      const payload = {
        user_id: auth.user.id,
        description: form.description.trim(),
        amount,
        start_date: form.start_date,
        end_date: (isInstallment ? form.last_installment_date : form.end_date) || null,
        kind: form.kind,
        recurrence: isInstallment && parcels ? "mensal" : form.recurrence,
        occurrence_count: isInstallment
          ? (parcels ?? null)
          : form.occurrence_count
            ? Number(form.occurrence_count)
            : null,
        profile_id: form.profile_id === "none" ? null : form.profile_id,
        property_id: form.property_id === "none" ? null : form.property_id,
        category_id: form.category_id === "none" ? null : form.category_id,
        recipient_name: form.recipient_name || null,
        payment_method: form.payment_method === "none" ? null : form.payment_method,
        account_id: form.account_id === "none" ? null : form.account_id,
        card_id: form.card_id === "none" ? null : form.card_id,
        notes: form.notes || null,
        status: "active",
      };

      const { error } = await sb.from("financial_forecasts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Previsão adicionada sem alterar seus lançamentos.");
      onOpenChange(false);
      onSaved();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar previsão"),
  });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar previsão</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Descrição">
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Valor">
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </Field>
          <Field label="Tipo">
            <BasicSelect
              value={form.kind}
              onChange={(v) => set("kind", v)}
              options={Object.entries(KIND_LABEL)}
            />
          </Field>
          <Field label="Data prevista / inicial">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
            />
          </Field>
          <Field label="Recorrência">
            <BasicSelect
              value={form.recurrence}
              onChange={(v) => set("recurrence", v)}
              options={[
                ["once", "Uma vez"],
                ["mensal", "Mensal"],
                ["bimestral", "Bimestral"],
                ["trimestral", "Trimestral"],
                ["semestral", "Semestral"],
                ["anual", "Anual"],
              ]}
            />
          </Field>
          {form.recurrence !== "once" && (
            <>
              <Field label="Data final">
                <Input
                  type="date"
                  min={form.start_date}
                  value={form.end_date}
                  onChange={(e) => set("end_date", e.target.value)}
                />
              </Field>
              <Field label="Quantidade de ocorrências">
                <Input
                  type="number"
                  min="1"
                  value={form.occurrence_count}
                  onChange={(e) => set("occurrence_count", e.target.value)}
                />
              </Field>
            </>
          )}
          <Field label="Perfil">
            <BasicSelect
              value={form.profile_id}
              onChange={(v) => {
                set("profile_id", v);
                set("property_id", "none");
              }}
              options={[["none", "Sem perfil"], ...data.profiles.map((x: any) => [x.id, x.name])]}
            />
          </Field>
          <Field label="Imóvel">
            <BasicSelect
              value={form.property_id}
              onChange={(v) => set("property_id", v)}
              options={[
                ["none", "Sem imóvel"],
                ...data.properties
                  .filter(
                    (x: any) => form.profile_id === "none" || x.profile_id === form.profile_id,
                  )
                  .map((x: any) => [x.id, x.name]),
              ]}
            />
          </Field>
          <Field label="Categoria">
            <BasicSelect
              value={form.category_id}
              onChange={(v) => set("category_id", v)}
              options={[
                ["none", "Sem categoria"],
                ...data.categories.map((x: any) => [x.id, x.name]),
              ]}
            />
          </Field>
          <Field label="Destinatário">
            <Input
              value={form.recipient_name}
              onChange={(e) => set("recipient_name", e.target.value)}
            />
          </Field>
          <Field label="Forma de pagamento">
            <BasicSelect
              value={form.payment_method}
              onChange={(v) => set("payment_method", v)}
              options={[["none", "Não definida"], ...Object.entries(paymentMethodLabel)]}
            />
          </Field>
          <Field label="Conta">
            <BasicSelect
              value={form.account_id}
              onChange={(v) => set("account_id", v)}
              options={[
                ["none", "Sem conta"],
                ...data.accounts
                  .filter(
                    (x: any) => form.profile_id === "none" || x.profile_id === form.profile_id,
                  )
                  .map((x: any) => [x.id, x.nickname]),
              ]}
            />
          </Field>
          <Field label="Cartão">
            <BasicSelect
              value={form.card_id}
              onChange={(v) => set("card_id", v)}
              options={[
                ["none", "Sem cartão"],
                ...data.cards
                  .filter(
                    (x: any) => form.profile_id === "none" || x.profile_id === form.profile_id,
                  )
                  .map((x: any) => [x.id, x.name]),
              ]}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Observação">
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </div>
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Esta previsão é somente planejamento e não cria um lançamento realizado.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar previsão
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function BasicSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: any[][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function ForecastSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-80" />
        <Skeleton className="mt-2 h-4 w-[32rem] max-w-full" />
      </div>
      <Skeleton className="h-36 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-96 xl:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
