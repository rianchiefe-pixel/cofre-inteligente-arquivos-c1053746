import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { getCardsStats } from "@/lib/cards.functions";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, CreditCard, ArrowRight, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { currencyBRL, parseBrlAmount } from "@/lib/format";
import { LoadingState, ErrorState, EmptyState } from "@/components/query-states";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/cards/")({
  head: () => ({
    meta: [
      { title: "Cartões — Meu Cofre" },
      { name: "description", content: "Gerencie cartões de crédito, titulares e faturas dos seus perfis financeiros." },
      { property: "og:title", content: "Cartões — Meu Cofre" },
      { property: "og:description", content: "Cartões, titulares adicionais e faturas em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CardsIndexPage,
});

type MonthlyPoint = {
  month: string;
  label: string;
  total: number;
  cards: { id: string; name: string; total: number }[];
};

const PALETTE = [
  "oklch(0.42 0.11 162)",
  "oklch(0.76 0.12 86)",
  "oklch(0.58 0.14 190)",
  "oklch(0.62 0.18 40)",
  "oklch(0.55 0.14 310)",
  "oklch(0.5 0.12 145)",
];

function CardUsageChart({ data }: { data: MonthlyPoint[] }) {
  const [months, setMonths] = useState(6);
  const visible = useMemo(() => data.slice(-months), [data, months]);
  const total = useMemo(() => visible.reduce((s, m) => s + m.total, 0), [visible]);

  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <BarChart3 className="h-4 w-4 text-accent" /> Gastos nos cartões
            </h3>
            <p className="text-sm text-muted-foreground">
              Total no período: <span className="font-medium text-foreground">{currencyBRL(total)}</span>
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
            {[3, 6, 12].map((n) => (
              <button
                key={n}
                onClick={() => setMonths(n)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  months === n
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {n}M
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="h-64 w-full px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={visible} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="cardUsageGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.52 0.11 165)" />
                <stop offset="100%" stopColor="oklch(0.35 0.09 162)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `R$${Math.round(v / 1000)}k` : `R$${v}`)}
              width={50}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const point = payload[0].payload as MonthlyPoint;
                return (
                  <div className="rounded-xl border bg-card p-3 shadow-lg">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{point.label}</p>
                    <p className="text-base font-bold text-foreground">{currencyBRL(point.total)}</p>
                    {point.cards.length > 0 && (
                      <div className="mt-2 space-y-1 border-t pt-2">
                        {point.cards.slice(0, 5).map((c, i) => (
                          <div key={c.id} className="flex items-center gap-2 text-xs">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                            />
                            <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                            <span className="font-medium text-foreground">{currencyBRL(c.total)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {visible.map((_, i) => (
                <Cell key={i} fill="url(#cardUsageGradient)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

const BRANDS = ["visa", "mastercard", "elo", "amex", "hipercard", "outro"];

function CardsIndexPage() {
  const qc = useQueryClient();
  const { activeProfileId } = useActiveProfile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", brand: "visa", last4: "", closing_day: "", due_day: "", holder: "", profile_id: activeProfileId || "", bank_id: "", credit_limit: "", additional_holders: "" });

  useEffect(() => {
    if (activeProfileId) {
      setForm((prev: any) => ({ ...prev, profile_id: activeProfileId }));
    }
  }, [activeProfileId]);

  const getCardsStatsFn = useServerFn(getCardsStats);

  const profiles = useQuery({
    queryKey: ["profiles"],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_profiles").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const banks = useQuery({
    queryKey: ["banks"],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("id, name, profile_id");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });


  const cardsQuery = useQuery({
    queryKey: ["cards-stats", activeProfileId],
    queryFn: () => getCardsStatsFn({ data: { profileId: activeProfileId! } }),
    enabled: !!activeProfileId,
  });

  const cards = cardsQuery.data?.cards || [];

  const create = useMutation({
    mutationFn: async () => {
      const additionalHolders = String(form.additional_holders || "")
        .split(/\n|,/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      const holders = [
        ...(form.holder ? [{ holder_name: form.holder, last4: form.last4 || null, is_primary: true }] : []),
        ...additionalHolders.map((name: string) => ({ holder_name: name, is_primary: false })),
      ];
      const { data: res, error } = await supabase.rpc("create_card_with_holders_rpc", {
        p_card: {
          name: form.name,
          brand: form.brand || null,
          last4: form.last4 || null,
          holder: form.holder || null,
          profile_id: form.profile_id || null,
          bank_id: form.bank_id || null,
          closing_day: form.closing_day ? Number(form.closing_day) : null,
          due_day: form.due_day ? Number(form.due_day) : null,
          credit_limit: form.credit_limit ? parseBrlAmount(form.credit_limit) : null,
        } as never,
        p_holders: holders as never,
      });
      if (error) throw new Error(error.message);
      const created = Array.isArray(res) ? res[0] : res;
      if (!created?.card_id) throw new Error("O cartão não foi confirmado pelo banco de dados.");
      return created;
    },
    onSuccess: (created) => {
      toast.success(
        created.holders_created > 0
          ? `Cartão criado com ${created.holders_created} titular(es)`
          : "Cartão criado",
      );
      setOpen(false);
      setForm({ name: "", brand: "visa", last4: "", closing_day: "", due_day: "", holder: "", profile_id: "", bank_id: "", credit_limit: "", additional_holders: "" });
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Cartões</h1><p className="text-sm text-muted-foreground">Cartões vinculados aos seus perfis.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="premium" disabled={(profiles.data ?? []).length === 0}><Plus className="h-4 w-4" /> Novo cartão</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cartão</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); if (create.isPending) return; create.mutate(); }} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Nome</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Nubank Ultravioleta" /></div>
                <div className="space-y-2">
                  <Label>Bandeira</Label>
                  <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={form.profile_id} onValueChange={(v) => setForm({ ...form, profile_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Select value={form.bank_id} onValueChange={(v) => setForm({ ...form, bank_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(banks.data ?? []).filter((b: any) => !form.profile_id || b.profile_id === form.profile_id).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2"><Label>Final</Label><Input maxLength={4} value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value })} /></div>
                <div className="space-y-2"><Label>Fechamento</Label><Input type="number" min={1} max={31} value={form.closing_day} onChange={(e) => setForm({ ...form, closing_day: e.target.value })} /></div>
                <div className="space-y-2"><Label>Vencimento</Label><Input type="number" min={1} max={31} value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Titular principal</Label><Input value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} /></div>
                <div className="space-y-2"><Label>Limite (R$)</Label><Input value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} placeholder="0,00" /></div>
              </div>
              <div className="space-y-2">
                <Label>Adicionais (um por linha ou separados por vírgula)</Label>
                <Input value={form.additional_holders} onChange={(e) => setForm({ ...form, additional_holders: e.target.value })} placeholder="Ex.: Maria Silva, João Silva" />
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={create.isPending} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" variant="premium" disabled={create.isPending || !form.profile_id || !form.name}>{create.isPending ? "Criando…" : "Criar"}</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {cardsQuery.isLoading && <LoadingState label="Carregando cartões…" />}
      {cardsQuery.isError && (
        <ErrorState error={cardsQuery.error} onRetry={() => cardsQuery.refetch()} retrying={cardsQuery.isFetching} title="Não foi possível carregar os cartões" />
      )}
      {!cardsQuery.isLoading && !cardsQuery.isError && cards.length === 0 && (
        <EmptyState
          title="Nenhum cartão cadastrado"
          description={
            (profiles.data ?? []).length === 0
              ? "Crie um perfil financeiro antes de cadastrar cartões."
              : "Cadastre um cartão para importar faturas e conciliar compras."
          }
        />
      )}

      {!cardsQuery.isLoading && !cardsQuery.isError && cards.length > 0 && (
        <CardUsageChart data={cardsQuery.data?.monthlyUsage || []} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c: any) => (
          <Card key={c.id} className="overflow-hidden flex flex-col group/card relative">
            <div className="bg-[image:var(--gradient-primary)] p-5 text-primary-foreground relative">
              <div className="flex justify-between items-start">
                <CreditCard className="h-6 w-6" />
                {c.stats?.pendingCount > 0 && (
                  <Badge className="bg-warning text-warning-foreground border-none">
                    {c.stats.pendingCount} pendentes
                  </Badge>
                )}
              </div>
              <p className="mt-6 font-mono tracking-wider">•••• •••• •••• {c.last4 && c.last4 !== '0000' ? c.last4 : "????"}</p>
              <div className="mt-3 flex justify-between items-end">
                <p className="text-xs uppercase opacity-80">{c.brand}</p>
                <div className="text-right">
                  <p className="text-[10px] uppercase opacity-70">Total Acumulado</p>
                  <p className="font-bold">{currencyBRL(c.stats?.total || 0)}</p>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-3 flex-1 flex flex-col">
              <div>
                <p className="font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.banks?.name || "Cartão"} • {profiles.data?.find(p => p.id === (c.profile_id || activeProfileId))?.name || "Pessoal"}</p>
              </div>
              
              {c.holders?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Portadores</p>
                  <div className="flex flex-wrap gap-1">
                    {c.holders.map((h: any) => (
                      <Badge key={h.id} variant="secondary" className="text-[9px] py-0 px-1.5 font-normal">
                        {h.holder_name.split(' ')[0]} {h.last4 ? `(${h.last4})` : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                <div>Fechamento: <span className="font-medium text-foreground">{c.closing_day || '—'}</span></div>
                <div>Vencimento: <span className="font-medium text-foreground">{c.due_day || '—'}</span></div>
              </div>

              <Button asChild size="sm" variant="outline" className="mt-auto w-full relative z-10">
                <Link to="/app/cards/$id" params={{ id: c.id }}>
                  Abrir cartão <ArrowRight className="h-3 w-3 ml-2" />
                </Link>
              </Button>
              <Link 
                to="/app/cards/$id" 
                params={{ id: c.id }} 
                className="absolute inset-0 z-0"
                aria-hidden="true"
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
