import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { LoadingState, ErrorState, EmptyState } from "@/components/query-states";
import { currencyBRL } from "@/lib/format";
import {
  getHoldingAdvocaciaPlan,
  applyHoldingAdvocaciaPlan,
  undoHoldingAdvocaciaPlan,
} from "@/lib/holding-organizer.functions";
import { ADVOCACIA_COST_CENTER } from "@/lib/advocacia-organizer";
import { Scale, Undo2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/holding-advocacia")({
  head: () => ({
    meta: [
      { title: "Advocacia na Holding — Meu Cofre" },
      {
        name: "description",
        content:
          "Organize os lançamentos da Advocacia Liliane Pereira dentro do perfil Holding com categorias, centro de custo e imóveis.",
      },
      { property: "og:title", content: "Advocacia na Holding — Meu Cofre" },
      {
        property: "og:description",
        content: "Classificação em lote dos lançamentos da advocacia, sempre dentro do perfil Holding.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HoldingAdvocaciaPage,
});

const CONFIDENCE_LABEL: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };

function HoldingAdvocaciaPage() {
  const qc = useQueryClient();
  const loadPlan = useServerFn(getHoldingAdvocaciaPlan);
  const applyPlan = useServerFn(applyHoldingAdvocaciaPlan);
  const undoPlan = useServerFn(undoHoldingAdvocaciaPlan);

  const [profileId, setProfileId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [ignored, setIgnored] = useState<Record<string, boolean>>({});
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null);

  const profiles = useQuery({
    queryKey: ["holding-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_profiles")
        .select("id, name")
        .eq("type", "holding")
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const plan = useQuery({
    queryKey: ["holding-advocacia-plan", profileId],
    enabled: Boolean(profileId),
    queryFn: () => loadPlan({ data: { profileId } }),
  });

  const apply = useMutation({
    mutationFn: (vars: { ids: string[] }) => applyPlan({ data: { profileId, receiptIds: vars.ids } }),
    onSuccess: async (result) => {
      setLastRun(result.runId);
      setSelected({});
      await qc.invalidateQueries();
      const notes = [
        `${result.applied} lançamento(s) organizado(s)`,
        result.categoriesCreated.length ? `${result.categoriesCreated.length} categoria(s) criada(s)` : null,
        result.propertiesCreated ? `${result.propertiesCreated} imóvel(is) criado(s)` : null,
        result.skipped.length ? `${result.skipped.length} ignorado(s) pelo servidor` : null,
      ].filter(Boolean);
      toast.success(notes.join(" · "));
      if (result.skipped.length > 0) {
        toast.warning(result.skipped.slice(0, 3).map((s) => s.reason).join(" · "));
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao organizar"),
  });

  const undo = useMutation({
    mutationFn: () => undoPlan({ data: { runId: lastRun! } }),
    onSuccess: async (result) => {
      setLastRun(null);
      await qc.invalidateQueries();
      toast.success(`${result.reverted} lançamento(s) restaurado(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao desfazer"),
  });

  const items = useMemo(() => {
    const data = plan.data;
    if (!data) return { auto: [], review: [] };
    return {
      auto: data.autoItems.filter((i) => !ignored[i.receiptId]),
      review: data.reviewItems.filter((i) => !ignored[i.receiptId]),
    };
  }, [plan.data, ignored]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id] && !ignored[id]);

  const rows = (list: typeof items.auto) =>
    list.map((item) => (
      <div
        key={item.receiptId}
        className="grid grid-cols-1 gap-2 border-b border-border/60 py-3 text-sm last:border-b-0 md:grid-cols-[auto_110px_120px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_110px]"
      >
        <Checkbox
          checked={Boolean(selected[item.receiptId])}
          onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [item.receiptId]: v === true }))}
          aria-label="Selecionar lançamento"
        />
        <span className="text-muted-foreground">{item.paymentDate ?? "—"}</span>
        <span className="font-medium tabular-nums">{currencyBRL(item.amount)}</span>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{item.recipient}</p>
          <p className="truncate text-xs text-muted-foreground">{item.reason}</p>
        </div>
        <div className="min-w-0 text-xs">
          <p className="text-muted-foreground">Atual: {item.currentCategory ?? "sem categoria"}</p>
          <p className="text-foreground">
            Sugerida: {item.suggestedParent} › {item.suggestedCategory}
            {!item.suggestedCategoryExists && <span className="text-muted-foreground"> (será criada)</span>}
          </p>
        </div>
        <div className="min-w-0 text-xs">
          <p className="text-foreground">Centro de custo: {item.costCenter}</p>
          <p className="text-muted-foreground">
            Imóvel: {item.suggestedProperty ?? "—"}
            {item.propertyWillBeCreated && " (novo)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={item.confidence === "high" ? "default" : "outline"}>{CONFIDENCE_LABEL[item.confidence]}</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIgnored((prev) => ({ ...prev, [item.receiptId]: true }))}
          >
            Ignorar
          </Button>
        </div>
      </div>
    ));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Scale className="h-6 w-6 text-accent" /> Advocacia Liliane Pereira na Holding
          </h1>
          <p className="text-sm text-muted-foreground">
            Organiza somente lançamentos que já pertencem ao perfil Holding selecionado. Nenhum registro é transferido
            entre perfis.
          </p>
        </div>
        {lastRun && (
          <Button variant="outline" onClick={() => undo.mutate()} disabled={undo.isPending}>
            <Undo2 className="mr-2 h-4 w-4" /> Desfazer última organização
          </Button>
        )}
      </div>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,320px)_auto] sm:items-end">
          <div className="space-y-2">
            <Label>Perfil Holding</Label>
            <Select value={profileId} onValueChange={(v) => { setProfileId(v); setSelected({}); setIgnored({}); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o perfil Holding existente" />
              </SelectTrigger>
              <SelectContent>
                {(profiles.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Centro de custo aplicado: <strong>{ADVOCACIA_COST_CENTER}</strong>
          </p>
        </div>
      </Card>

      {!profileId && <EmptyState title="Selecione o perfil Holding" description="A organização roda apenas dentro do perfil escolhido." />}

      {profileId && plan.isLoading && <LoadingState label="Analisando lançamentos da Holding…" />}
      {profileId && plan.isError && <ErrorState error={plan.error} onRetry={() => plan.refetch()} />}

      {plan.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Lançamentos na Holding", value: plan.data.totalReceipts },
              { label: "Confiança alta", value: items.auto.length },
              { label: "Para revisão", value: items.review.length },
              { label: "Sem evidência", value: plan.data.unmatched },
            ].map((kpi) => (
              <Card key={kpi.label} className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.value}</p>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="premium"
              disabled={items.auto.length === 0 || apply.isPending}
              onClick={() =>
                setConfirm({ ids: items.auto.map((i) => i.receiptId), label: "Aplicar classificações confiáveis" })
              }
            >
              <Sparkles className="mr-2 h-4 w-4" /> Organizar lançamentos da Advocacia Liliane Pereira ({items.auto.length})
            </Button>
            <Button
              variant="outline"
              disabled={selectedIds.length === 0 || apply.isPending}
              onClick={() => setConfirm({ ids: selectedIds, label: "Aprovar selecionados" })}
            >
              Aprovar selecionados ({selectedIds.length})
            </Button>
            <Button
              variant="ghost"
              disabled={selectedIds.length === 0}
              onClick={() => {
                setIgnored((prev) => ({ ...prev, ...Object.fromEntries(selectedIds.map((id) => [id, true])) }));
                setSelected({});
              }}
            >
              Ignorar selecionados
            </Button>
          </div>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Confiança alta — aplicação automática</h2>
            {items.auto.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lançamento com confiança alta pendente.</p>
            ) : (
              <div>{rows(items.auto)}</div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Revisão — confiança média ou baixa</h2>
            {items.review.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada para revisar.</p>
            ) : (
              <div>{rows(items.review)}</div>
            )}
          </Card>
        </>
      )}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.ids.length} lançamento(s) da Holding receberão categoria, centro de custo{" "}
              {ADVOCACIA_COST_CENTER} e imóvel quando houver evidência. Valores, datas, comprovantes e o perfil não são
              alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) apply.mutate({ ids: confirm.ids });
                setConfirm(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}