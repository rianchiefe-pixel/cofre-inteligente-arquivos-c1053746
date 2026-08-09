import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { ArrowLeft, CreditCard, Eye, History, FileText, Search, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CardStatementImport } from "@/components/card-statement-import";
import { CardStatementReview } from "@/components/card-statement-review";
import { currencyBRL } from "@/lib/format";
import { LoadingState, ErrorState, NotFoundState, EmptyState } from "@/components/query-states";

export const Route = createFileRoute("/_authenticated/app/cards/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe do cartão — Meu Cofre" },
      { name: "description", content: "Faturas, titulares e limites do cartão selecionado." },
      { property: "og:title", content: "Detalhe do cartão — Meu Cofre" },
      { property: "og:description", content: "Acompanhe faturas importadas e titulares do cartão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CardDetailPage,
});

function CardDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [activeHolderId, setActiveHolderId] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("history");

  const card = useQuery({
    queryKey: ["card", id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("cards")
          .select("*, banks(name), profile:financial_profiles!cards_profile_id_fkey(name, color)")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (e: any) {
        console.error("[CardDetailPage] Error fetching card:", e);
        throw e;
      }
    },
  });


  const statements = useQuery({
    queryKey: ["card-statements", id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("card_statements")
          .select("*")
          .eq("card_id", id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      } catch (e: any) {
        console.error("[CardDetailPage] Error fetching statements:", e);
        throw e;
      }
    },
  });

  const transactions = useQuery({
    queryKey: ["card-receipts", id, activeHolderId, selectedMonth],
    queryFn: async () => {
      try {
        let query = supabase
          .from("receipts")
          .select("*, card_holders(holder_name, last4)")
          .eq("card_id", id);
        
        if (activeHolderId !== "all") {
          query = query.eq("card_holder_id", activeHolderId);
        }
        
        const { data, error } = await query.order("payment_date", { ascending: false });
        if (error) throw error;
        
        let filtered = (data || []) as any[];
        if (selectedMonth !== "all") {
          const [year, month] = selectedMonth.split("-");
          filtered = filtered.filter(t => {
            if (!t.payment_date) return false;
            const d = new Date(t.payment_date);
            return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
          });
        }
        
        return filtered;
      } catch (e: any) {
        console.error("[CardDetailPage] Error fetching transactions:", e);
        throw e;
      }
    },
  });

  const holders = useQuery({
    queryKey: ["card-holders", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_holders")
        .select("*")
        .eq("card_id", id)
        .order("is_primary", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    if (!transactions.data) return null;
    const data = transactions.data as any[];
    
    const total = data.reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const count = data.length;
    const biggest = data.reduce((max, t) => Math.max(max, Number(t.amount || 0)), 0);
    const avg = count > 0 ? total / count : 0;
    const holdersCount = new Set(data.map(t => t.card_holder_id).filter(Boolean)).size;
    
    let topCategory = "—";
    if (count > 0) {
      const catMap = data.reduce((acc: any, t) => {
        const cat = t.category_name || 'Sem categoria';
        acc[cat] = (acc[cat] || 0) + Number(t.amount || 0);
        return acc;
      }, {});
      const sorted = Object.entries(catMap).sort((a: any, b: any) => b[1] - a[1]);
      if (sorted.length > 0) topCategory = sorted[0][0];
    }

    return { total, count, biggest, avg, holdersCount, topCategory };
  }, [transactions.data]);

  const Line = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex justify-between border-b border-white/10 pb-1 last:border-0">
      <span className="text-white/60 text-[10px] uppercase">{label}</span>
      <span className="font-medium text-xs">{value}</span>
    </div>
  );

  const updateCardMutation = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("cards").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cartão atualizado");
      qc.invalidateQueries({ queryKey: ["card", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (card.isLoading) return <LoadingState label="Carregando cartão…" />;
  if (card.isError) {
    return (
      <ErrorState
        error={card.error}
        onRetry={() => card.refetch()}
        retrying={card.isFetching}
        title="Não foi possível carregar o cartão"
      />
    );
  }
  if (!card.data) {
    return (
      <NotFoundState
        title="Cartão não encontrado"
        description="Este cartão pode ter sido excluído ou pertence a outra conta."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/cards"><ArrowLeft className="h-4 w-4" /> Voltar para cartões</Link>
          </Button>
        }
      />
    );
  }
  const c = card.data as any;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/cards">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{c.name}</h1>
        <Badge variant="outline" className="uppercase">{c.brand}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="bg-[image:var(--gradient-primary)] p-5 text-primary-foreground">
              <CreditCard className="h-6 w-6" />
              <p className="mt-8 font-mono tracking-wider">•••• •••• •••• {c.last4 && c.last4 !== '0000' ? c.last4 : "????"}</p>
              <p className="mt-3 text-xs uppercase opacity-80">{c.holder ?? "Titular não identificado"}</p>
            </div>
            <div className="space-y-2 p-4 text-sm">
              <Line label="Instituição" value={(Array.isArray(c.banks) ? c.banks[0]?.name : c.banks?.name) || "Cartão"} />
              <Line label="Perfil" value={(Array.isArray(c.profile) ? c.profile[0]?.name : c.profile?.name) ?? "Pessoal"} />
              <Line
                label="Total (Filtrado)"
                value={stats ? currencyBRL(stats.total) : "—"}
              />
              <Line label="Lançamentos" value={stats?.count || 0} />
              <Line label="Portadores" value={stats?.holdersCount || 0} />
               <Line label="Maior Compra" value={stats ? currencyBRL(stats.biggest) : "—"} />
               <Line label="Gasto Médio" value={stats ? currencyBRL(stats.avg) : "—"} />
              <Line label="Top Categoria" value={stats?.topCategory || "—"} />
              <Line label="Fechamento" value={c.closing_day ? `Dia ${c.closing_day}` : "—"} />
              <Line label="Vencimento" value={c.due_day ? `Dia ${c.due_day}` : "—"} />
              {c.credit_limit && <Line label="Limite" value={currencyBRL(Number(c.credit_limit))} />}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold mb-3">Portadores</h2>
            {holders.isError ? (
              <ErrorState
                error={holders.error}
                onRetry={() => holders.refetch()}
                retrying={holders.isFetching}
                title="Erro ao carregar titulares"
              />
            ) : holders.isLoading ? (
              <LoadingState label="Carregando portadores…" />
            ) : holders.data && holders.data.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {holders.data.map((h: any) => (
                  <li
                    key={h.id}
                    className="rounded-full border bg-muted/40 px-3 py-1 text-[11px] font-medium"
                  >
                    {h.holder_name}
                    {h.last4 ? ` • final ${h.last4}` : ""}
                    {h.is_primary ? " (Principal)" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum portador identificado.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <CardStatementImport
            cardId={id}
            onDone={(sid) => {
              statements.refetch();
              setReviewId(sid);
            }}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" /> Histórico de Lançamentos
          </TabsTrigger>
          <TabsTrigger value="statements" className="gap-2">
            <FileText className="h-4 w-4" /> Faturas Importadas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b bg-muted/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 overflow-x-auto pb-2 sm:pb-0">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os meses</SelectItem>
                    {/* Unique months from transactions are calculated below */}
                    {Array.from(new Set((transactions.data || []).map(t => {
                      if (!t.payment_date) return null;
                      const d = new Date(t.payment_date);
                      if (isNaN(d.getTime())) return null;
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    }).filter(Boolean) as string[])).sort().reverse().map(m => {
                      const [y, mon] = m.split('-');
                      const date = new Date(parseInt(y), parseInt(mon) - 1);
                      const label = date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                      const capitalizedLabel = label ? label.charAt(0).toUpperCase() + label.slice(1) : m;
                      return <SelectItem key={m} value={m}>{capitalizedLabel}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>

                <Select value={activeHolderId} onValueChange={setActiveHolderId}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Portador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os portadores</SelectItem>
                    {holders.data?.map((h: any) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.holder_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative flex-1 max-w-xs hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar no histórico..." className="pl-9 h-9" />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Portador</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Comprovante</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.isLoading ? (
                  <TableRow><TableCell colSpan={7}><LoadingState label="Buscando histórico..." /></TableCell></TableRow>
                ) : (transactions.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7}><div className="py-12 text-center text-muted-foreground">Nenhum lançamento encontrado com estes filtros.</div></TableCell></TableRow>
                ) : (transactions.data ?? []).map((t: any) => (
                  <TableRow key={t.id} className="group">
                    <TableCell className="text-[11px] font-mono">
                      {t.payment_date ? new Date(t.payment_date).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-[11px]">
                      {t.card_holders?.holder_name || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-xs">{t.description}</div>
                      {t.notes && <div className="text-[9px] text-muted-foreground truncate max-w-[200px]">{t.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px] font-normal py-0">
                        {t.category_name || "Sem categoria"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {currencyBRL(Number(t.amount))}
                    </TableCell>
                    <TableCell>
                      {t.file_path ? (
                        <Button 
                          variant="link" 
                          className="h-auto p-0 text-[10px] text-success hover:text-success/80"
                          onClick={() => window.open(supabase.storage.from('receipts').getPublicUrl(t.file_path).data.publicUrl, '_blank')}
                        >
                          Ver PDF
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">Sem comprovante</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="statements" className="space-y-4">
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.isLoading ? (
                  <TableRow><TableCell colSpan={6}><LoadingState label="Carregando faturas..." /></TableCell></TableRow>
                ) : (statements.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6}><EmptyState title="Nenhuma fatura" description="Importe o PDF ou CSV da fatura para conciliar." /></TableCell></TableRow>
                ) : (statements.data ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-[280px] truncate text-xs font-medium">
                      {s.source_file_name}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.period_start ? `${s.period_start} a ${s.period_end ?? "?"}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{s.due_date ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">
                      {s.total_amount ? currencyBRL(Number(s.total_amount)) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setReviewId(s.id)} className="gap-2">
                        <Eye className="h-3.5 w-3.5" /> Conferir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <CardStatementReview
        statementId={reviewId}
        open={!!reviewId}
        onOpenChange={(o) => !o && setReviewId(null)}
      />
    </div>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}