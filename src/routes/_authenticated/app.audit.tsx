import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState, ErrorState } from "@/components/query-states";
import { ShieldAlert, Search, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/app/audit")({
  head: () => ({
    meta: [
      { title: "Trilha de auditoria — Meu Cofre" },
      { name: "description", content: "Histórico de alterações, criações e exclusões registradas no sistema, com filtros por período, entidade e ação." },
      { property: "og:title", content: "Trilha de auditoria — Meu Cofre" },
      { property: "og:description", content: "Acompanhe todas as movimentações registradas no seu cofre com data, entidade e valores anteriores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditTrailPage,
});

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  profile_id: string | null;
  property_id: string | null;
  old_value: unknown;
  new_value: unknown;
  note: string | null;
  created_at: string;
};

const PERIODS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "all", label: "Todo o período" },
];

function actionStyle(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("exclu") || a.includes("remov")) return "bg-destructive text-destructive-foreground";
  if (a.includes("create") || a.includes("insert") || a.includes("cri")) return "bg-emerald-600 text-white";
  if (a.includes("update") || a.includes("edit") || a.includes("altera")) return "bg-amber-500 text-black";
  return "bg-muted text-foreground";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function AuditTrailPage() {
  const [period, setPeriod] = useState("30");
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["audit-logs", period],
    queryFn: async () => {
      let q = sb
        .from("audit_logs")
        .select("id, action, entity, entity_id, profile_id, property_id, old_value, new_value, note, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (period !== "all") {
        const from = new Date();
        from.setDate(from.getDate() - Number(period));
        q = q.gte("created_at", from.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditLog[];
    },
    staleTime: 30_000,
  });

  const logs = query.data ?? [];

  const entities = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entity))).sort(),
    [logs],
  );
  const actions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (entity !== "all" && l.entity !== entity) return false;
      if (action !== "all" && l.action !== action) return false;
      if (!term) return true;
      const haystack = [l.entity, l.action, l.note ?? "", l.entity_id ?? "", JSON.stringify(l.old_value ?? ""), JSON.stringify(l.new_value ?? "")]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [logs, entity, action, search]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Trilha de auditoria</h1>
            <p className="text-sm text-muted-foreground">
              Registros de criação, alteração e exclusão feitos no sistema.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <Card className="p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por entidade, observação ou ID"
              className="pl-8"
            />
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger><SelectValue placeholder="Entidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as entidades</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} registro(s) exibido(s){logs.length >= 500 ? " (limite de 500 mais recentes)" : ""}.
        </p>
      </Card>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error as Error} onRetry={() => query.refetch()} />
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum registro de auditoria encontrado para os filtros selecionados.
        </Card>
      ) : (
        <Card className="divide-y">
          {filtered.map((log) => {
            const open = expanded === log.id;
            return (
              <div key={log.id} className="p-4">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : log.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={actionStyle(log.action)}>{log.action}</Badge>
                      <span className="font-medium">{log.entity}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</span>
                    </div>
                    {log.note && <p className="text-sm text-muted-foreground break-words">{log.note}</p>}
                    {log.entity_id && (
                      <p className="text-xs font-mono text-muted-foreground break-all">ID: {log.entity_id}</p>
                    )}
                  </div>
                  {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                </button>

                {open && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Valor anterior</p>
                      <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                        {log.old_value ? JSON.stringify(log.old_value, null, 2) : "—"}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Novo valor</p>
                      <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                        {log.new_value ? JSON.stringify(log.new_value, null, 2) : "—"}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
