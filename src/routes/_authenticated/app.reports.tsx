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
import { MultiSelect } from "@/components/ui/multi-select";

import type { ReportPayload } from "@/lib/exports";
import { loadReportDataset, normalizeFinancialClassification } from "@/lib/report-data";
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
  const [profileId, setProfileId] = useState<string>("all");
  const [type, setType] = useState("all");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [extraIncludes, setExtraIncludes] = useState<{ propertyIds: string[], categoryIds: string[], recipients: string[] }>({ propertyIds: [], categoryIds: [], recipients: [] });
  const [openAddRecipient, setOpenAddRecipient] = useState(false);
  const [openAddProperty, setOpenAddProperty] = useState(false);
  const [openAddCategory, setOpenAddCategory] = useState(false);
  
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  const normalizeOptionalUuid = (value: string | null | undefined): string | null => {
    if (!value || value === "all") return null;
    return UUID_REGEX.test(value) ? value : null;
  };

  const normalizeUuidArray = (values: string[]) => 
    values.filter(v => UUID_REGEX.test(v));

  const normalizedProfileId = normalizeOptionalUuid(profileId);
  const normalizedPropertyIds = normalizeUuidArray(selectedPropertyIds);
  const normalizedCategoryIds = normalizeUuidArray(selectedCategoryIds);

  const [modelLoading, setModelLoading] = useState<"monthly" | "fixed" | null>(null);
  const ledgerFn = useServerFn(getUnifiedLedger);

  const runModelReport = async (model: "monthly" | "fixed") => {
    if (!normalizedProfileId) {
      toast.error("Selecione um perfil para gerar este relatório.");
      return;
    }
    try {
      setModelLoading(model);
      const dataset = await loadReportDataset({
        from,
        to,
        profileId: normalizedProfileId,
        propertyIds: normalizedPropertyIds.length > 0 ? normalizedPropertyIds : null,
        categoryIds: normalizedCategoryIds.length > 0 ? normalizedCategoryIds : null,
        recipients: selectedRecipients.length > 0 ? selectedRecipients : null,
        extraIncludes: extraIncludes,
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
      toast.success("Relatório gerado, conferido e registrado na auditoria.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar o relatório.");
    } finally {
      setModelLoading(null);
    }
  };

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });
  const selectedBrand = useQuery({
    queryKey: ["profile-brand", normalizedProfileId],
    enabled: Boolean(normalizedProfileId),
    queryFn: async () => {
      if (!normalizedProfileId) return null;
      const { data, error } = await supabase.from("financial_profiles").select("*").eq("id", normalizedProfileId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const properties = useQuery({ queryKey: ["properties"], queryFn: async () => (await supabase.from("properties").select("id, name").order("name")).data ?? [] });
  const categories = useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [] });
  
  // Destinatários para o filtro (distinct name)
  const recipients = useQuery({
    queryKey: ["recipients-list", normalizedProfileId],
    enabled: Boolean(normalizedProfileId),
    queryFn: async () => {
      const { data } = await supabase
        .from("receipts")
        .select("recipient_name")
        .eq("profile_id", normalizedProfileId!)
        .eq("status", "approved")
        .not("recipient_name", "is", null);
      
      const names = [...new Set((data ?? []).map(r => r.recipient_name?.trim()))]
        .filter(Boolean)
        .sort((a, b) => a!.localeCompare(b!, "pt-BR"));
      
      return names.map(name => ({ label: name!, value: name! }));
    }
  });

  const data = useQuery({
    queryKey: ["report", from, to, normalizedProfileId, type, normalizedPropertyIds, normalizedCategoryIds, selectedRecipients, extraIncludes],


    queryFn: async () => {
      if (!normalizedProfileId) {
        // Permitir "Todos os perfis" para o resumo geral
        // Se a instrução diz que Relatórios exige um perfil, mantemos o erro,
        // mas as instruções 7 dizem "Todos os perfis seja permitido para o resumo geral/exportação"
        // mas também diz "O isolamento por perfil é obrigatório" no código atual.
        // Vou seguir a instrução 7: "Todos os perfis seja permitido para o resumo geral".
      }

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
        if (normalizedProfileId) q = q.eq("profile_id", normalizedProfileId);

        const hasNormalFilters = (type !== "all") || (normalizedPropertyIds.length > 0) || (normalizedCategoryIds.length > 0) || (selectedRecipients.length > 0);
        const hasExtraIncludes = (extraIncludes.propertyIds.length > 0) || (extraIncludes.categoryIds.length > 0) || (extraIncludes.recipients.length > 0);

        if (hasNormalFilters || hasExtraIncludes) {
          const orParts: string[] = [];
          
          // Filtros normais (OR entre eles para composição do set de entrada)
          if (type !== "all") {
             // transaction_type não funciona bem no OR do PostgREST se quisermos AND type AND (outros).
             // Mas o usuário quer: (Imóvel A OU Imóvel B OU Destinatário X) respeitando o tipo global se selecionado.
             // Então o tipo continua sendo um AND global se não for "all".
          }

          if (normalizedPropertyIds.length > 0) orParts.push(`property_id.in.(${normalizedPropertyIds.join(",")})`);
          if (normalizedCategoryIds.length > 0) orParts.push(`category_id.in.(${normalizedCategoryIds.join(",")})`);
          if (selectedRecipients.length > 0) orParts.push(`recipient_name.in.(${selectedRecipients.map(r => `"${r}"`).join(",")})`);

          // Inclusões extras (OR)
          if (extraIncludes.propertyIds.length > 0) orParts.push(`property_id.in.(${extraIncludes.propertyIds.join(",")})`);
          if (extraIncludes.categoryIds.length > 0) orParts.push(`category_id.in.(${extraIncludes.categoryIds.join(",")})`);
          if (extraIncludes.recipients.length > 0) orParts.push(`recipient_name.in.(${extraIncludes.recipients.map(r => `"${r}"`).join(",")})`);

          if (orParts.length > 0) {
            q = q.or(orParts.join(","));
          }
        }
        
        if (type !== "all") q = q.eq("transaction_type", type as any);

        const { data, error } = await q;
        if (error) throw error;
        const page = data ?? [];
        all.push(...page);
        if (page.length < PAGE) break;
      }
      return all;
    },
  });

  // Deduplicação rigorosa por ID para evitar somar o mesmo valor duas vezes (Regra 9, 20)
  const rows = useMemo(() => {
    const raw = data.data ?? [];
    const uniqueMap = new Map();
    for (const r of raw) {
      if (!uniqueMap.has(r.id)) {
        uniqueMap.set(r.id, r);
      }
    }
    return Array.from(uniqueMap.values()).filter((r: any) => 
      r.transaction_type === 'despesa' || 
      r.transaction_type === 'investimento' || 
      r.transaction_type === 'gasto_fixo' || 
      r.transaction_type === 'gasto_variavel'
    );
  }, [data.data]);
  const profileIdToName = new Map<string, string>((profiles.data ?? []).map((p: any) => [p.id, p.name]));
  
  // Regra Canônica: TOTAL = DESPESAS + INVESTIMENTOS
  const { totalExpenses, totalInvestments, totalFixed, totalVariable, totalOther } = useMemo(() => {
    let exp = 0;
    let inv = 0;
    let fix = 0;
    let var_ = 0;
    let oth = 0;

    for (const r of rows) {
      const norm = normalizeFinancialClassification({ 
        transaction_type: r.transaction_type, 
        expense_behavior: r.expense_behavior 
      });
      
      if (norm.nature === 'investimento') {
        inv += Number(r.amount ?? 0);
      } else if (norm.nature === 'despesa') {
        const val = Number(r.amount ?? 0);
        exp += val;
        if (norm.behavior === 'fixed') fix += val;
        else if (norm.behavior === 'variable') var_ += val;
        else oth += val;
      }
    }
    return { 
      totalExpenses: exp, 
      totalInvestments: inv, 
      totalFixed: fix, 
      totalVariable: var_, 
      totalOther: oth 
    };
  }, [rows]);

  const total = totalExpenses + totalInvestments;


  // Razão unificado (comprovantes + lançamentos de cartão, sem dupla contagem).
  const ledger = useQuery({
    queryKey: ["ledger", from, to, normalizedProfileId, normalizedPropertyIds, normalizedCategoryIds, selectedRecipients, extraIncludes],
    enabled: Boolean(normalizedProfileId),
    queryFn: () =>
      ledgerFn({
        data: {
          from: from || undefined,
          to: to || undefined,
          profileId: normalizedProfileId,
          propertyId: normalizedPropertyIds.length === 1 ? normalizedPropertyIds[0] : null,
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
    const totalInvested = totalInvestments;
    const totalFixedVal = totalFixed;
    const totalVariableVal = totalVariable;
    const totalOtherVal = totalOther;

    const groupSum = (getKey: (r: any) => string) => {
      const m: Record<string, number> = {};
      for (const r of rows as any[]) { 
        // Only sum rows that have a valid canonical type (despesa/investimento)
        if (r.transaction_type !== 'despesa' && r.transaction_type !== 'investimento' && r.transaction_type !== 'gasto_fixo' && r.transaction_type !== 'gasto_variavel') continue;
        const k = getKey(r) || "—"; 
        m[k] = (m[k] ?? 0) + Number(r.amount ?? 0); 
      }
      return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, value: currencyBRL(v) }));
    };
    return {
      title: "Relatório Financeiro",
      subtitle: profileId !== "all" ? (profiles.data ?? []).find((p) => p.id === profileId)?.name : "Consolidado",
      period: { from, to },
      filters: { from, to, profileId, type, propertyIds: selectedPropertyIds, categoryIds: selectedCategoryIds, recipients: selectedRecipients, extraIncludes } as any,
      brand,
      summary: [
        { label: "Total geral", value: currencyBRL(total) },
        { label: "Gasto do mês (sem investimentos)", value: currencyBRL(totalExpenses) },
        { label: "Investido", value: currencyBRL(totalInvested) },
        { label: "Gasto fixo", value: currencyBRL(totalFixedVal) },
        { label: "Gasto variável", value: currencyBRL(totalVariableVal) },
        { label: "Outras despesas", value: currencyBRL(totalOtherVal) },
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
        { header: "Natureza", key: "type", get: (r) => normalizeFinancialClassification({ transaction_type: r.transaction_type, expense_behavior: r.expense_behavior }).nature === 'despesa' ? 'Despesa' : 'Investimento', width: 14 },
        { header: "Tipo de Gasto", key: "behavior", get: (r) => {
          const norm = normalizeFinancialClassification({ transaction_type: r.transaction_type, expense_behavior: r.expense_behavior });
          if (norm.nature === 'investimento') return 'Não se aplica';
          return norm.behavior === 'fixed' ? 'Fixo' : norm.behavior === 'variable' ? 'Variável' : 'Não definido';
        }, width: 14 },
        { header: "Método", key: "method", get: (r) => paymentMethodLabel[r.payment_method as string] ?? r.payment_method ?? "", width: 14 },
        { header: "Autenticação", key: "auth", get: (r) => r.auth_code ?? "", width: 18 },
        { header: "Observações", key: "notes", get: (r) => r.description ?? "", width: 28 },
      ],
      rows,
      filename: `Relatorio-${profileId === 'c44c244d-b05f-47dc-bc58-7056351e7703' ? 'Pessoal' : profileId === '2906fc21-93bc-42ad-8ca3-701b94fdb5f6' ? 'Holding' : 'Perfil'}-${from}-a-${to}-${Date.now()}`,

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
        <div className="grid gap-4 md:grid-cols-4 md:items-end">
          <div className="space-y-2"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-2"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Perfil</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
              <SelectContent>
                {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(transactionTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3 md:items-start">
          <div className="space-y-2">
            <Label>Imóveis</Label>
            <MultiSelect
              placeholder="Todos os imóveis"
              options={(properties.data ?? []).map(p => ({ label: p.name, value: p.id }))}
              selected={selectedPropertyIds}
              onChange={setSelectedPropertyIds}
            />
            
            <div className="mt-2 flex flex-col gap-2">
              <Select onValueChange={(val) => {
                if (val === "recipient") {
                  setOpenAddRecipient(true);
                } else if (val === "property") {
                  setOpenAddProperty(true);
                } else if (val === "category") {
                  setOpenAddCategory(true);
                }
              }}>
                <SelectTrigger className="h-7 w-fit border-dashed bg-transparent text-[11px] hover:bg-muted">
                  <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" /> + Adicionar ao relatório</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recipient">Destinatários</SelectItem>
                  <SelectItem value="property">Imóveis</SelectItem>
                  <SelectItem value="category">Categorias</SelectItem>
                </SelectContent>
              </Select>

              {/* Inclusões extras UI */}
              {(extraIncludes.recipients.length > 0 || extraIncludes.propertyIds.length > 0 || extraIncludes.categoryIds.length > 0) && (
                <div className="mt-2 space-y-2 rounded-lg border border-dashed p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Inclusões adicionais</p>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-5 px-1 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setExtraIncludes({ propertyIds: [], categoryIds: [], recipients: [] })}
                    >
                      Limpar inclusões
                    </Button>
                  </div>
                  
                  {extraIncludes.recipients.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Destinatários:</p>
                      <div className="flex flex-wrap gap-1">
                        {extraIncludes.recipients.map(r => (
                          <span key={r} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                            {r}
                            <button onClick={() => setExtraIncludes(prev => ({ ...prev, recipients: prev.recipients.filter(x => x !== r) }))} className="hover:text-red-600">×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {extraIncludes.propertyIds.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Imóveis:</p>
                      <div className="flex flex-wrap gap-1">
                        {extraIncludes.propertyIds.map(id => {
                          const name = properties.data?.find(p => p.id === id)?.name || id;
                          return (
                            <span key={id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                              {name}
                              <button onClick={() => setExtraIncludes(prev => ({ ...prev, propertyIds: prev.propertyIds.filter(x => x !== id) }))} className="hover:text-red-600">×</button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {extraIncludes.categoryIds.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Categorias:</p>
                      <div className="flex flex-wrap gap-1">
                        {extraIncludes.categoryIds.map(id => {
                          const name = categories.data?.find(c => c.id === id)?.name || id;
                          return (
                            <span key={id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                              {name}
                              <button onClick={() => setExtraIncludes(prev => ({ ...prev, categoryIds: prev.categoryIds.filter(x => x !== id) }))} className="hover:text-red-600">×</button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Hidden MultiSelects triggered by Select */}
              <div className="hidden">
                <MultiSelect
                  id="btn-add-recipient"
                  options={recipients.data ?? []}
                  selected={extraIncludes.recipients}
                  onChange={(vals) => setExtraIncludes(prev => ({ ...prev, recipients: vals }))}
                />
                <MultiSelect
                  id="btn-add-property"
                  options={(properties.data ?? []).map(p => ({ label: p.name, value: p.id }))}
                  selected={extraIncludes.propertyIds}
                  onChange={(vals) => setExtraIncludes(prev => ({ ...prev, propertyIds: vals }))}
                />
                <MultiSelect
                  id="btn-add-category"
                  options={(categories.data ?? []).map(c => ({ label: c.name, value: c.id }))}
                  selected={extraIncludes.categoryIds}
                  onChange={(vals) => setExtraIncludes(prev => ({ ...prev, categoryIds: vals }))}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Categorias</Label>
            <MultiSelect
              placeholder="Todas as categorias"
              options={(categories.data ?? []).map(c => ({ label: c.name, value: c.id }))}
              selected={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
            />
          </div>
          <div className="space-y-2">
            <Label>Destinatários</Label>
            <MultiSelect
              placeholder="Todos os destinatários"
              options={recipients.data ?? []}
              selected={selectedRecipients}
              onChange={setSelectedRecipients}
              emptyText="Nenhum destinatário encontrado."
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-muted-foreground"
            onClick={() => {
              setFrom(initialRange.from);
              setTo(initialRange.to);
              setProfileId("all");
              setType("all");
              setSelectedPropertyIds([]);
              setSelectedCategoryIds([]);
              setSelectedRecipients([]);
            }}
          >
            Limpar filtros
          </Button>
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
              <Button variant="outline" disabled={!normalizedProfileId || modelLoading !== null} onClick={() => runModelReport("monthly")}>
                {modelLoading === "monthly" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Relatório de gastos (mensal)
              </Button>
              <Button variant="outline" disabled={!normalizedProfileId || modelLoading !== null} onClick={() => runModelReport("fixed")}>
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
        <Card className="p-5">
          <p className="text-xs uppercase text-muted-foreground">Despesas</p>
          <p className="mt-2 text-2xl font-bold">{currencyBRL(totalExpenses)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-muted-foreground">Investimentos</p>
          <p className="mt-2 text-2xl font-bold">{currencyBRL(totalInvestments)}</p>
        </Card>
        <Card className="p-5"><p className="text-xs uppercase text-muted-foreground">Comprovantes</p><p className="mt-2 text-2xl font-bold">{rows.length}</p></Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-muted-foreground">Fixos</p>
          <p className="mt-2 text-2xl font-bold text-orange-600">{currencyBRL(totalFixed)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-muted-foreground">Variáveis</p>
          <p className="mt-2 text-2xl font-bold text-orange-400">{currencyBRL(totalVariable)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-muted-foreground">Outros</p>
          <p className="mt-2 text-2xl font-bold text-gray-500">{currencyBRL(totalOther)}</p>
        </Card>
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