import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { ArrowLeft, CreditCard, Eye } from "lucide-react";
import { CardStatementImport } from "@/components/card-statement-import";
import { CardStatementReview } from "@/components/card-statement-review";
import { currencyBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/cards/$id")({
  head: () => ({ meta: [{ title: "Cartão — Meu Cofre" }] }),
  component: CardDetailPage,
});

function CardDetailPage() {
  const { id } = Route.useParams();
  const [reviewId, setReviewId] = useState<string | null>(null);

  const card = useQuery({
    queryKey: ["card", id],
    queryFn: async () =>
      (
        await supabase
          .from("cards")
          .select("*, banks(name), financial_profiles(name, color)")
          .eq("id", id)
          .single()
      ).data,
  });

  const holders = useQuery({
    queryKey: ["card-holders", id],
    queryFn: async () =>
      (await supabase.from("card_holders").select("*").eq("card_id", id)).data ?? [],
  });

  const statements = useQuery({
    queryKey: ["card-statements", id],
    queryFn: async () =>
      (
        await supabase
          .from("card_statements")
          .select("*")
          .eq("card_id", id)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  if (!card.data) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
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
        <Card className="overflow-hidden">
          <div className="bg-[image:var(--gradient-primary)] p-5 text-primary-foreground">
            <CreditCard className="h-6 w-6" />
            <p className="mt-8 font-mono tracking-wider">•••• •••• •••• {c.last4 ?? "0000"}</p>
            <p className="mt-3 text-xs uppercase opacity-80">{c.holder ?? "titular"}</p>
          </div>
          <div className="space-y-2 p-4 text-sm">
            <Line label="Banco" value={c.banks?.name ?? "—"} />
            <Line label="Perfil" value={c.financial_profiles?.name ?? "—"} />
            <Line
              label="Limite"
              value={c.credit_limit ? currencyBRL(Number(c.credit_limit)) : "—"}
            />
            <Line label="Fechamento" value={c.closing_day ?? "—"} />
            <Line label="Vencimento" value={c.due_day ?? "—"} />
          </div>
        </Card>

        <div className="space-y-4">
          <CardStatementImport
            cardId={id}
            onDone={(sid) => {
              statements.refetch();
              setReviewId(sid);
            }}
          />

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Titulares identificados</h2>
            {holders.data && holders.data.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {holders.data.map((h: any) => (
                  <li
                    key={h.id}
                    className="rounded-full border bg-muted/40 px-3 py-1 text-xs"
                  >
                    {h.holder_name}
                    {h.last4 ? ` • final ${h.last4}` : ""}
                    {h.is_primary ? " (titular)" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Titulares e finais adicionais serão identificados automaticamente na primeira fatura importada.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Faturas importadas</h2>
        <div className="mt-3 overflow-auto">
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
              {(statements.data ?? []).map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[280px] truncate text-xs">
                    {s.source_file_name}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.period_start ? `${s.period_start} a ${s.period_end ?? "?"}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{s.due_date ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {s.total_amount ? currencyBRL(Number(s.total_amount)) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase">
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setReviewId(s.id)}>
                      <Eye className="h-3 w-3" /> Conferir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(statements.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                    Nenhuma fatura importada ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

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