import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, AlertTriangle, Minus, Loader2, Plus, Info, ExternalLink, FilterX } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useProfile } from "@/hooks/use-profile";
import { findRecurringFixedExpenseMatch, setRecurringExpenseMatch, createRecurringFixedExpense } from "@/lib/recurring-expenses.functions";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/app/fixed-expenses")({
  component: FixedExpensesPage,
});

const MONTHS_COUNT = 12;

function FixedExpensesPage() {
  const { profileId } = useProfile();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [selectedMatch, setSelectedMatch] = useState<{ expense: any, month: Date } | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const findMatchFn = useServerFn(findRecurringFixedExpenseMatch);
  const setMatchFn = useServerFn(setRecurringExpenseMatch);
  const createExpenseFn = useServerFn(createRecurringFixedExpense);

  const months = useMemo(() => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 1);
    return eachMonthOfInterval({ start, end });
  }, [year]);

  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery({
    queryKey: ["recurring_fixed_expenses", profileId],
    queryFn: async () => {
      if (profileId === "all") return [];
      const { data } = await supabase
        .from("recurring_fixed_expenses")
        .select("*")
        .eq("profile_id", profileId)
        .eq("active", true)
        .order("name");
      return data || [];
    },
    enabled: profileId !== "all",
  });

  const { data: properties = [] } = useQuery({
    queryKey: ["properties", profileId],
    queryFn: async () => {
      if (profileId === "all") return [];
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("profile_id", profileId);
      return data || [];
    },
  });

  // Query to get all matches for the current grid
  const { data: matches = {}, isLoading: isLoadingMatches } = useQuery({
    queryKey: ["recurring_expense_matches", profileId, year],
    queryFn: async () => {
      if (profileId === "all" || expenses.length === 0) return {};
      
      const { data } = await supabase
        .from("recurring_expense_matches")
        .select("*, receipts(*)")
        .in("recurring_fixed_expense_id", expenses.map((e: any) => e.id))
        .gte("month", `${year}-01-01`)
        .lte("month", `${year}-12-01`);

      const map: Record<string, any> = {};
      data?.forEach(m => {
        const key = `${m.recurring_fixed_expense_id}-${m.month}`;
        map[key] = m;
      });
      return map;
    },
    enabled: profileId !== "all" && expenses.length > 0,
  });

  // Query to find suggestions
  const { data: suggestions = [] } = useQuery({
    queryKey: ["recurring_suggestions", profileId],
    queryFn: async () => {
      if (profileId === "all") return [];
      // Look for receipts marked as fixed that appear in at least 3 different months
      const { data } = await supabase
        .from("receipts")
        .select("recipient_name, category_id, property_id")
        .eq("profile_id", profileId)
        .eq("expense_behavior", "fixed")
        .not("recipient_name", "is", null);

      if (!data) return [];
      
      // Basic grouping logic for suggestions
      const counts: Record<string, number> = {};
      const items: Record<string, any> = {};
      
      data.forEach(r => {
        const key = `${r.recipient_name}-${r.property_id}`;
        counts[key] = (counts[key] || 0) + 1;
        items[key] = r;
      });

      return Object.entries(counts)
        .filter(([_, count]) => count >= 3)
        .map(([key, count]) => ({
          ...items[key],
          count,
        }))
        .filter(s => !expenses.find((e: any) => e.name.includes(s.recipient_name)));
    },
    enabled: profileId !== "all",
  });

  const runScan = async () => {
    if (profileId === "all" || expenses.length === 0) return;
    setIsScanning(true);
    toast.info("Iniciando varredura histórica...");
    
    try {
      let foundCount = 0;
      for (const expense of expenses) {
        for (const monthDate of months) {
          const key = `${expense.id}-${format(monthDate, "yyyy-MM-01")}`;
          if (matches[key]) continue; // Skip if already has a match

          const result = await findMatchFn({
            data: {
              profile_id: profileId,
              expense,
              month: monthDate.getMonth() + 1,
              year: monthDate.getFullYear()
            }
          });

          if (result && (result.status === 'encontrado' || result.status === 'revisar')) {
            await setMatchFn({
              data: {
                recurring_fixed_expense_id: expense.id,
                month: format(monthDate, "yyyy-MM-01"),
                receipt_id: result.match?.id,
                status: result.status
              }
            });
            foundCount++;
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["recurring_expense_matches"] });
      toast.success(`Varredura concluída. ${foundCount} novos lançamentos identificados.`);
    } catch (e) {
      toast.error("Erro durante a varredura");
    } finally {
      setIsScanning(false);
    }
  };

  const handleCreateFromSuggestion = async (s: any) => {
    try {
      await createExpenseFn({
        data: {
          profile_id: profileId,
          name: s.recipient_name,
          merchant_pattern: s.recipient_name,
          category_id: s.category_id,
          property_id: s.property_id,
          start_month: format(startOfMonth(subMonths(new Date(), 6)), "yyyy-MM-01"),
          active: true
        }
      });
      await queryClient.invalidateQueries({ queryKey: ["recurring_fixed_expenses"] });
      toast.success("Gasto fixo adicionado!");
    } catch (e) {
      toast.error("Erro ao adicionar gasto fixo");
    }
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e: any) => 
      selectedPropertyId === "all" || e.property_id === selectedPropertyId
    );
  }, [expenses, selectedPropertyId]);

  if (profileId === "all") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <FolderLock className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
        <h2 className="text-xl font-semibold">Selecione um perfil</h2>
        <p className="text-muted-foreground">Escolha Pessoal ou Holding para gerenciar os gastos fixos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight font-display">Gastos Fixos</h1>
          <p className="text-muted-foreground">Acompanhe as despesas que devem se repetir mensalmente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={runScan} 
            disabled={isScanning || expenses.length === 0}
            className="gap-2"
          >
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Varrer histórico
          </Button>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sugestões */}
      {suggestions.length > 0 && (
        <Card className="p-4 border-accent/30 bg-accent/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-accent">Sugestões encontradas</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-3 bg-background p-2 px-3 rounded-lg border border-border/50 text-sm">
                <span>{s.recipient_name} <span className="text-muted-foreground text-xs">({s.count} meses)</span></span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-accent" onClick={() => handleCreateFromSuggestion(s)}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Imóvel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os imóveis</SelectItem>
            {properties.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={() => { setSelectedPropertyId("all"); setYear(new Date().getFullYear()); }}>
          <FilterX className="h-4 w-4" />
        </Button>
      </div>

      {/* Matriz */}
      <Card className="overflow-hidden border-border/60">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[200px] font-bold">Gasto Fixo</TableHead>
                {months.map(m => (
                  <TableHead key={m.getTime()} className="text-center min-w-[60px] uppercase text-[10px] font-black tracking-widest">
                    {format(m, "MMM", { locale: ptBR })}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingExpenses ? (
                <TableRow>
                  <TableCell colSpan={13} className="h-32 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20" />
                  </TableCell>
                </TableRow>
              ) : filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="h-32 text-center text-muted-foreground">
                    Nenhum gasto fixo cadastrado para este perfil.
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((expense: any) => (
                  <TableRow key={expense.id} className="hover:bg-muted/10 transition-colors">
                    <TableCell className="font-medium text-sm border-r border-border/30">
                      {expense.name}
                      {expense.property_id && (
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {properties.find((p: any) => p.id === expense.property_id)?.name}
                        </p>
                      )}
                    </TableCell>
                    {months.map(month => {
                      const key = `${expense.id}-${format(month, "yyyy-MM-01")}`;
                      const match = matches[key];
                      
                      return (
                        <TableCell 
                          key={month.getTime()} 
                          className="text-center p-0 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => setSelectedMatch({ expense, month })}
                        >
                          <div className="flex items-center justify-center h-12 w-full">
                            {match ? (
                              match.status === 'encontrado' ? <CheckCircle2 className="h-5 w-5 text-success" /> :
                              match.status === 'revisar' ? <AlertTriangle className="h-5 w-5 text-yellow-500" /> :
                              match.status === 'nao_se_aplica' ? <Minus className="h-5 w-5 text-muted-foreground/30" /> :
                              <XCircle className="h-5 w-5 text-destructive/40" />
                            ) : (
                              <div className="h-2 w-2 rounded-full bg-border" />
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mensal Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {months.map(month => {
          const monthKey = format(month, "yyyy-MM-01");
          const totalInMonth = filteredExpenses.length;
          const foundInMonth = filteredExpenses.filter((e: any) => {
            const m = matches[`${e.id}-${monthKey}`];
            return m && (m.status === 'encontrado' || m.status === 'nao_se_aplica');
          }).length;
          
          const isComplete = totalInMonth > 0 && foundInMonth === totalInMonth;

          return (
            <Card key={month.getTime()} className={cn("p-3 flex flex-col gap-1 border-border/50", isComplete && "bg-success/5 border-success/20")}>
              <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">{format(month, "MMMM", { locale: ptBR })}</span>
              <div className="flex items-end justify-between">
                <span className="text-lg font-black tracking-tighter">{foundInMonth} de {totalInMonth}</span>
                {isComplete ? (
                   <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/30 uppercase">Completo</Badge>
                ) : (
                   <span className="text-[10px] text-muted-foreground font-medium">{totalInMonth - foundInMonth} pendente</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal de Detalhe do Mês */}
      <Dialog open={!!selectedMatch} onOpenChange={() => setSelectedMatch(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-accent" />
              Detalhes do Gasto
            </DialogTitle>
          </DialogHeader>
          
          {selectedMatch && (
            <div className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Gasto</label>
                  <p className="font-semibold">{selectedMatch.expense.name}</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Período</label>
                  <p className="font-semibold capitalize">{format(selectedMatch.month, "MMMM / yyyy", { locale: ptBR })}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-muted/30">
                {matches[`${selectedMatch.expense.id}-${format(selectedMatch.month, "yyyy-MM-01")}`] ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge className={cn(
                        matches[`${selectedMatch.expense.id}-${format(selectedMatch.month, "yyyy-MM-01")}`].status === 'encontrado' ? "bg-success" :
                        matches[`${selectedMatch.expense.id}-${format(selectedMatch.month, "yyyy-MM-01")}`].status === 'revisar' ? "bg-yellow-500" :
                        "bg-muted"
                      )}>
                        {matches[`${selectedMatch.expense.id}-${format(selectedMatch.month, "yyyy-MM-01")}`].status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {matches[`${selectedMatch.expense.id}-${format(selectedMatch.month, "yyyy-MM-01")}`].receipts && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Favorecido:</span>
                          <span className="font-medium">{matches[`${selectedMatch.expense.id}-${format(selectedMatch.month, "yyyy-MM-01")}`].receipts.recipient_name || "Não identificado"}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Data lançamento:</span>
                          <span className="font-medium">{format(new Date(matches[`${selectedMatch.expense.id}-${format(selectedMatch.month, "yyyy-MM-01")}`].receipts.payment_date), "dd/MM/yyyy")}</span>
                        </div>
                        <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                          <a href={`/app/vault?receipt=${matches[`${selectedMatch.expense.id}-${format(selectedMatch.month, "yyyy-MM-01")}`].receipts.id}`} target="_blank" rel="noopener noreferrer">
                            Ver lançamento <ExternalLink className="h-3 w-3 ml-2" />
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 space-y-3">
                    <p className="text-sm text-muted-foreground">Lançamento ainda não localizado.</p>
                    <Button variant="secondary" size="sm" className="w-full">
                      <Search className="h-3 w-3 mr-2" /> Procurar manualmente
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-muted-foreground"
                  onClick={async () => {
                    await setMatchFn({
                      data: {
                        recurring_fixed_expense_id: selectedMatch.expense.id,
                        month: format(selectedMatch.month, "yyyy-MM-01"),
                        status: 'nao_se_aplica',
                        receipt_id: null
                      }
                    });
                    await queryClient.invalidateQueries({ queryKey: ["recurring_expense_matches"] });
                    setSelectedMatch(null);
                  }}
                >
                  Marcar como não se aplica
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Sparkles = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>
);

const RefreshCw = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>
  </svg>
);

const Search = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);
