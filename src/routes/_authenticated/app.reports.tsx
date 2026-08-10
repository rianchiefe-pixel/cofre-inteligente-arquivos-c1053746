import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getUnifiedLedger } from "@/lib/finance.functions";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currencyBRL, dateBR, paymentMethodLabel, transactionTypeLabel } from "@/lib/format";
import { monthRange } from "@/lib/date-range";
import { useCan } from "@/lib/permissions";
import { ExportMenu } from "@/components/export-menu";
import type { ReportPayload } from "@/lib/exports";
import { loadReportDataset } from "@/lib/report-data";
import { generateFixedVariableReport, generateMonthlyExpenseReport } from "@/lib/report-templates";
import { toast } from "sonner";
import { FileText, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { isUncategorizedReceipt } from "@/lib/categorization-utils";


export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({
    meta: [
      { title: "Relatórios — Meu Cofre" },
      { name: "description", content: "Filtre, consolide e exporte comprovantes e lançamentos de cartão em PDF, Excel ou CSV." },
      { property: "og:title", content: "Relatórios — Meu Cofre" },
      { property: "og:description", content: "Razão financeiro unificado com exportações auditadas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const navigate = useNavigate();

  const canExport = useCan("exportReports");
  const initialRange = monthRange();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [profileId, setProfileId] = useState<string>("");
  const [type, setType] = useState("all");
  const [propertyId, setPropertyId] = useState("all");
  const [modelLoading, setModelLoading] = useState<"monthly" | "fixed" | null>(null);
  const ledgerFn = useServerFn(getUnifiedLedger);

  const runModelReport = async (model: "monthly" | "fixed") => {
    try {
      setModelLoading(model);
      const dataset = await loadReportDataset({
        from,
        to,
        profileId: profileId,
        propertyId: propertyId === "all" ? null : propertyId,
      });
      if (!dataset.months.length) {
        toast.error("Nenhum lançamento aprovado no período selecionado.");
        return;
      }
      const result = model === "monthly"
        ? await generateMonthlyExpenseReport(dataset)
        : await generateFixedVariableReport(dataset);
      if (result && result.audited === false) {
        toast.warning(`Relatório gerado, mas a auditoria falhou: ${result.auditError ?? "motivo desconhecido"}`);
        return;
      }
      const warnings = (result as any)?.warnings as Array<{ code: string; message: string }> | undefined;
      if (warnings?.length) {
        const conflict = warnings.find(w => w.code === "class_conflict");
        toast.warning(`Relatório gerado com ${warnings.length} alerta(s).`, { 
          description: warnings[0].message,
          action: conflict ? {
            label: "Corrigir Categorias",
            onClick: () => window.location.href = "/app/categories"
          } : undefined
        });
        return;
      }
      toast.success("Relatório gerado, conferido e registrado na auditoria.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar o relatório.");
    } finally {
      setModelLoading(null);
    }
  };

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const selectedBrand = useQuery({
    queryKey: ["profile-brand", profileId],
    enabled: profileId !== "all",
    queryFn: async () => (await supabase.from("financial_profiles").select("*").eq("id", profileId).maybeSingle()).data,
  });
  const properties = useQuery({ queryKey: ["properties"], queryFn: async () => (await supabase.from("properties").select("id, name").order("name")).data ?? [] });

  const data = useQuery({
    queryKey: ["report", from, to, profileId, type, propertyId],
    queryFn: async () => {
      // Paginação completa: sem teto artificial de 1.000 registros.
      const PAGE = 1000;
      const all: any[] = [];
      for (let offset = 0; offset < 100000; offset += PAGE) {
        let q = supabase
          .from("receipts")
          .select("*, category:categories!receipts_category_id_fkey(name), properties(name)")
          .eq("status", "approved")
          .order("payment_date", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (from) q = q.gte("payment_date", from);
        if (to) q = q.lte("payment_date", to);
        if (profileId === "all") {
          throw new Error("O isolamento por perfil é obrigatório. Selecione um perfil para gerar o relatório.");
        }
        q = q.eq("profile_id", profileId);
        if (type !== "all") q = q.eq("transaction_type", type as any);
        if (propertyId !== "all") q = q.eq("property_id", propertyId);
        const { data, error } = await q;
        if (error) throw error;
        const page = data ?? [];
        all.push(...page);
        if (page.length < PAGE) break;
      }
      return all;
    },
  });

  const rows = (data.data ?? []).filter((r: any) => r.transaction_type === 'despesa' || r.transaction_type === 'investimento');
  const profileIdToName = new Map<string, string>((profiles.data ?? []).map((p: any) => [p.id, p.name]));
  const total = useMemo(() => rows.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0), [rows]);

  // Razão unificado (comprovantes + lançamentos de cartão, sem dupla contagem).
  const ledger = useQuery({
    queryKey: ["ledger", from, to, profileId, propertyId],
    enabled: profileId !== "all",
    queryFn: () =>
      ledgerFn({
        data: {
          from: from || undefined,
          to: to || undefined,
          profileId: profileId === "all" ? null : profileId,
          propertyId: propertyId === "all" ? null : propertyId,
          includeCards: true,
        },
      }),
  });

  const buildPayload = (): ReportPayload => {
    const b = selectedBrand.data as any;
    const brand = b ? {
      displayName: b.display_name ?? b.name,
      legalName: b.legal_name, taxId: b.tax_id, address: b.address,
      phone: b.phone, email: b.email, logoUrl: b.logo_url,
      primaryColor: b.primary_color ?? b.color,
      secondaryColor: b.secondary_color, accentColor: b.accent_color,
      footerText: b.footer_text,
    } : null;
    const totalInvested = rows.filter((r: any) => r.transaction_type === "investimento").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const totalFixed = rows.filter((r: any) => r.expense_behavior === "fixed" && r.transaction_type === "despesa").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const totalVariable = rows.filter((r: any) => r.expense_behavior === "variable" && r.transaction_type === "despesa").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const groupSum = (getKey: (r: any) => string) => {
      const m: Record<string, number> = {};
      for (const r of rows as any[]) { 
        // Only sum rows that have a valid canonical type (despesa/investimento)
        if (r.transaction_type !== 'despesa' && r.transaction_type !== 'investimento') continue;
        const k = getKey(r) || "—"; 
        m[k] = (m[k] ?? 0) + Number(r.amount ?? 0); 
      }
      return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, value: currencyBRL(v) }));
    };
    return {
      title: "Relatório Financeiro",
      subtitle: profileId !== "all" ? (profiles.data ?? []).find((p) => p.id === profileId)?.name : "Consolidado",
      period: { from, to },
      filters: { from, to, profileId, type, propertyId },
      brand,
      summary: [
        { label: "Total geral", value: currencyBRL(total) },
        { label: "Gasto do mês (sem investimentos)", value: currencyBRL(total - totalInvested) },
        { label: "Investido", value: currencyBRL(totalInvested) },
        { label: "Gasto fixo", value: currencyBRL(totalFixed) },
        { label: "Gasto variável", value: currencyBRL(totalVariable) },
        { label: "Comprovantes", value: String(rows.length) },
        { label: "Ticket médio", value: currencyBRL(rows.length ? total / rows.length : 0) },
      ],
      breakdowns: [
        { title: "Por categoria", rows: groupSum((r) => r.category?.name).filter(row => {
          const name = (row.name || '').toLowerCase();
          return (
            !name.includes("não identificado") && 
            !name.includes("não classificado") && 
            !name.includes("sem categoria") && 
            !name.includes("não informado") &&
            name !== "—" &&
            name !== ""
          );
        }) },
        { title: "Por banco", rows: groupSum((r) => r.bank_name) },
        { title: "Por perfil", rows: groupSum((r) => profileIdToName.get(r.profile_id) || "—") },
        { title: "Por imóvel", rows: groupSum((r) => r.properties?.name) },
      ],
      columns: [
        { header: "Data", key: "payment_date", get: (r) => dateBR(r.payment_date), width: 12 },
        { header: "Valor", key: "amount", get: (r) => currencyBRL(Number(r.amount ?? 0)), width: 14 },
        { header: "Destinatário", key: "recipient", get: (r) => r.recipient_name ?? "", width: 26 },
        { header: "Banco", key: "bank", get: (r) => r.bank_name ?? "", width: 16 },
        { header: "Perfil", key: "profile", get: (r) => profileIdToName.get(r.profile_id) ?? "", width: 16 },
        { header: "Imóvel", key: "property", get: (r) => r.properties?.name ?? "", width: 18 },
        { header: "Categoria", key: "category", get: (r) => r.category?.name ?? "", width: 16 },
        { header: "Natureza", key: "type", get: (r) => transactionTypeLabel[r.transaction_type as string] ?? "", width: 14 },
        { header: "Tipo de Gasto", key: "behavior", get: (r) => r.expense_behavior === 'fixed' ? 'Fixo' : r.expense_behavior === 'variable' ? 'Variável' : 'Não definido', width: 14 },
        { header: "Método", key: "method", get: (r) => paymentMethodLabel[r.payment_method as string] ?? r.payment_method ?? "", width: 14 },
        { header: "Autenticação", key: "auth", get: (r) => r.auth_code ?? "", width: 18 },
        { header: "Observações", key: "notes", get: (r) => r.description ?? "", width: 28 },
      ],
      rows,
      filename: `meu-cofre-${from}-a-${to}`,
      reportKind: "relatorio_geral",
    };
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
          {canExport && <ExportMenu build={buildPayload} disabled={rows.length === 0} />}
        </div>
      </Card>

      {canExport && (
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Relatórios modelo</p>
              <p className="text-xs text-muted-foreground">
                Mesma formatação dos relatórios oficiais — mês, categoria, subcategoria, memória de cálculo e gráficos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={modelLoading !== null} onClick={() => runModelReport("monthly")}>
                {modelLoading === "monthly" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Relatório de gastos (mensal)
              </Button>
              <Button variant="outline" disabled={modelLoading !== null} onClick={() => runModelReport("fixed")}>
                {modelLoading === "fixed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Gastos fixos e variáveis
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase text-muted-foreground">Total</p>
          <p className="mt-2 text-2xl font-bold">{currencyBRL(total)}</p>
          {rows.some(r => isUncategorizedReceipt({ category_id: r.category_id, categories: r.category })) && (
            <button
              onClick={() => navigate({
                to: "/app/categories/pending",
                search: {
                  from,
                  to,
                  profileId: profileId === "all" ? undefined : profileId
                }
              })}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
            >
              Corrigir pendências <ArrowRight className="h-3 w-3" />
            </button>
          )}

        </Card>
        <Card className="p-5"><p className="text-xs uppercase text-muted-foreground">Comprovantes</p><p className="mt-2 text-2xl font-bold">{rows.length}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase text-muted-foreground">Ticket médio</p><p className="mt-2 text-2xl font-bold">{currencyBRL(rows.length ? total / rows.length : 0)}</p></Card>
      </div>

      {data.isError && (
        <Card className="grid gap-3 border-destructive/40 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <p className="text-sm text-destructive">
            Não foi possível carregar os lançamentos: {(data.error as any)?.message ?? "erro desconhecido"}. Os totais acima não representam o período.
          </p>
          <Button variant="outline" size="sm" onClick={() => data.refetch()}><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Razão unificado</p>
            <p className="text-xs text-muted-foreground">
              Comprovantes aprovados + lançamentos de cartão, sem dupla contagem do pagamento da fatura.
            </p>
          </div>
          {ledger.isError && (
            <Button variant="outline" size="sm" onClick={() => ledger.refetch()}>
              Tentar novamente
            </Button>
          )}
        </div>
        {ledger.isLoading ? (
          <p className="mt-3 text-xs text-muted-foreground">Calculando…</p>
        ) : ledger.isError ? (
          <p className="mt-3 text-xs text-destructive">
            {(ledger.error as any)?.message ?? "Não foi possível calcular o razão."}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Total consolidado</p>
              <p className="mt-1 text-xl font-bold">{currencyBRL(ledger.data?.totals.total ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Gasto (sem investimentos)</p>
              <p className="mt-1 text-xl font-bold">{currencyBRL(ledger.data?.totals.spend ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">investido: {currencyBRL(ledger.data?.totals.invested ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Comprovantes</p>
              <p className="mt-1 text-xl font-bold">{currencyBRL(ledger.data?.totals.receipts ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Cartões</p>
              <p className="mt-1 text-xl font-bold">{currencyBRL(ledger.data?.totals.cards ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">{ledger.data?.totals.excluded ?? 0} fora do total (pagamentos de fatura)</p>
            </div>
          </div>
        )}
      </Card>

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
              {data.isLoading && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Carregando lançamentos…</td></tr>}
              {!data.isLoading && rows.map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-3">{dateBR(r.payment_date)}</td>
                  <td className="px-4 py-3">{r.recipient_name ?? "—"}</td>
                  <td className="px-4 py-3">{r.category?.name ?? "—"}</td>
                  <td className="px-4 py-3">{profileIdToName.get(r.profile_id) ?? "—"}</td>
                  <td className="px-4 py-3">{r.bank_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{currencyBRL(Number(r.amount ?? 0))}</td>
                </tr>
              ))}
              {!data.isLoading && !data.isError && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum registro nos filtros atuais.</td></tr>}
              {data.isError && <tr><td colSpan={6} className="px-4 py-10 text-center text-destructive">Falha ao carregar os lançamentos.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}