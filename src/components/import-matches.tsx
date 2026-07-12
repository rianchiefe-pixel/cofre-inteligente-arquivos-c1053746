import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Loader2,
  Link2,
  Link2Off,
  FileSearch,
  Star,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import {
  matchBatchReceipts,
  attachFileManually,
  detachRowFile,
  setPrimaryRowFile,
  type MatchProgress,
  type MatchTier,
} from "@/lib/receipt-matcher";
import { reprocessBatchFacts } from "@/lib/zip-import";
import { currencyBRL } from "@/lib/format";

const TIER_LABEL: Record<MatchTier, string> = {
  very_high: "muito alta",
  high: "alta",
  review: "conferir",
  low: "baixa",
  none: "não localizado",
};

function tierClass(tier: MatchTier) {
  switch (tier) {
    case "very_high":
      return "bg-emerald-600 text-white";
    case "high":
      return "bg-emerald-500/80 text-white";
    case "review":
      return "bg-amber-500 text-white";
    case "low":
      return "bg-muted text-foreground";
    default:
      return "bg-destructive/80 text-white";
  }
}

export function ImportMatches({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<MatchProgress | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: ["import-rows-match", batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_rows")
        .select("id, row_number, transaction_date, amount, payee, description, file_name, folder_path, source_id, invoice_number, bank, card, card_last4, payment_method, holder, page_number")
        .eq("batch_id", batchId)
        .order("row_number")
        .limit(2000);
      return data ?? [];
    },
    enabled: !!batchId,
  });

  const links = useQuery({
    queryKey: ["import-row-files", batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_row_files")
        .select("*")
        .eq("batch_id", batchId)
        .order("score", { ascending: false })
        .limit(10000);
      return data ?? [];
    },
    enabled: !!batchId,
  });

  const files = useQuery({
    queryKey: ["import-files-simple", batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_files")
        .select("id, file_name, original_path, folder, extension, page_count")
        .eq("batch_id", batchId)
        .order("original_path")
        .limit(5000);
      return data ?? [];
    },
    enabled: !!batchId,
  });

  const fileById = useMemo(() => {
    const map = new Map<string, any>();
    for (const f of files.data ?? []) map.set(f.id, f);
    return map;
  }, [files.data]);

  const linksByRow = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const l of links.data ?? []) {
      if (!map.has(l.row_id)) map.set(l.row_id, []);
      map.get(l.row_id)!.push(l);
    }
    return map;
  }, [links.data]);

  const stats = useMemo(() => {
    const list = rows.data ?? [];
    let matched = 0;
    let review = 0;
    let missing = 0;
    for (const r of list) {
      const rl = linksByRow.get(r.id) ?? [];
      if (rl.length === 0) missing++;
      else if (rl.some((l) => l.confidence === "very_high" || l.confidence === "high")) matched++;
      else review++;
    }
    return { total: list.length, matched, review, missing };
  }, [rows.data, linksByRow]);

  async function runMatch() {
    setBusy(true);
    setProgress({ rowsTotal: rows.data?.length ?? 0, rowsDone: 0, matched: 0, needsReview: 0, notFound: 0 });
    try {
      // Re-normaliza valores/datas dos comprovantes com o parser BRL corrigido
      // antes de recruzar — garante que "R$ 5.33" seja lido como 5,33.
      const rp = await reprocessBatchFacts(batchId);
      if (rp.total > 0) {
        toast.message(`Comprovantes reprocessados: ${rp.updated}/${rp.total}`);
      }
      const p = await matchBatchReceipts(batchId, { onProgress: setProgress });
      toast.success(
        `${p.matched} associados · ${p.needsReview} p/ conferir · ${p.notFound} sem comprovante`,
      );
      qc.invalidateQueries({ queryKey: ["import-row-files", batchId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao cruzar comprovantes");
    } finally {
      setBusy(false);
    }
  }

  const openRow = (rows.data ?? []).find((r) => r.id === openRowId);

  return (
    <Card className="p-5">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <FileSearch className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Localização automática dos comprovantes</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{stats.total} linhas</span>
          <span>· {stats.matched} associadas</span>
          <span>· {stats.review} p/ conferir</span>
          <span>· {stats.missing} sem comprovante</span>
        </div>
        <Button size="sm" onClick={runMatch} disabled={busy || rows.isLoading}>
          {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
          Cruzar comprovantes
        </Button>
      </header>

      {busy && progress && progress.rowsTotal > 0 && (
        <div className="mb-3">
          <Progress value={(progress.rowsDone / progress.rowsTotal) * 100} />
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.rowsDone}/{progress.rowsTotal} — {progress.matched} ok · {progress.needsReview} conferir · {progress.notFound} sem comprovante
          </p>
        </div>
      )}

      <div className="max-h-[520px] overflow-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 text-left">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Data</th>
              <th className="p-2">Descrição</th>
              <th className="p-2 text-right">Valor</th>
              <th className="p-2">Comprovante</th>
              <th className="p-2 text-center">Score</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r) => {
              const rl = (linksByRow.get(r.id) ?? []).slice().sort((a, b) => b.score - a.score);
              const primary = rl.find((l) => l.is_primary) ?? rl[0];
              const primaryFile = primary ? fileById.get(primary.file_id) : null;
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="p-2 text-muted-foreground">{r.row_number}</td>
                  <td className="p-2">{r.transaction_date ?? "—"}</td>
                  <td className="p-2 max-w-[240px] truncate">{r.description ?? r.payee ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">
                    {typeof r.amount === "number" ? currencyBRL(r.amount) : "—"}
                  </td>
                  <td className="p-2">
                    {primaryFile ? (
                      <div className="flex items-center gap-1">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[200px] truncate font-mono text-[11px]">
                          {primaryFile.file_name}
                          {primary.page_number ? ` · p.${primary.page_number}` : ""}
                        </span>
                        {rl.length > 1 && (
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            +{rl.length - 1}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">não localizado</span>
                    )}
                  </td>
                  <td className="p-2 text-center">
                    {primary ? (
                      <Badge className={tierClass(primary.confidence as MatchTier)}>
                        {primary.score} · {TIER_LABEL[primary.confidence as MatchTier]}
                      </Badge>
                    ) : (
                      <Badge variant="outline">—</Badge>
                    )}
                  </td>
                  <td className="p-2">
                    <Button size="sm" variant="ghost" onClick={() => setOpenRowId(r.id)}>
                      <Link2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {(rows.data ?? []).length === 0 && !rows.isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Nenhuma linha nesta importação.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openRow && (
        <RowMatchDialog
          row={openRow}
          batchId={batchId}
          links={(linksByRow.get(openRow.id) ?? []).slice().sort((a, b) => b.score - a.score)}
          files={files.data ?? []}
          onClose={() => setOpenRowId(null)}
          onChanged={() =>
            qc.invalidateQueries({ queryKey: ["import-row-files", batchId] })
          }
        />
      )}
    </Card>
  );
}

function RowMatchDialog({
  row,
  batchId,
  links,
  files,
  onClose,
  onChanged,
}: {
  row: any;
  batchId: string;
  links: any[];
  files: any[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<string>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files.slice(0, 30);
    return files
      .filter((f) =>
        `${f.file_name} ${f.original_path ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [files, query]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Linha {row.row_number} — comprovantes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p>
              <b>{row.description ?? row.payee ?? "—"}</b> · {row.transaction_date ?? "—"} ·{" "}
              {typeof row.amount === "number" ? currencyBRL(row.amount) : "—"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {row.bank ? `Banco: ${row.bank} · ` : ""}
              {row.card ? `Cartão: ${row.card} · ` : ""}
              {row.payment_method ? `Forma: ${row.payment_method} · ` : ""}
              {row.file_name ? `Arquivo esperado: ${row.file_name}` : ""}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">Candidatos ({links.length})</p>
            {links.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum candidato — associe manualmente abaixo.
              </p>
            )}
            <div className="space-y-2">
              {links.map((l) => {
                const f = files.find((x) => x.id === l.file_id);
                return (
                  <div
                    key={l.id}
                    className="flex items-start gap-2 rounded-lg border border-border p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {l.is_primary && (
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                        )}
                        <span className="truncate font-mono text-[11px]">
                          {f?.original_path ?? f?.file_name ?? l.file_id}
                          {l.page_number ? ` · p.${l.page_number}` : ""}
                        </span>
                        {l.is_manual && (
                          <Badge variant="outline" className="text-[10px]">
                            manual
                          </Badge>
                        )}
                        <Badge className={`ml-auto ${tierClass(l.confidence as MatchTier)}`}>
                          {l.score} · {TIER_LABEL[l.confidence as MatchTier]}
                        </Badge>
                      </div>
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {(l.match_reasons ?? []).map((r: any, i: number) => (
                          <li
                            key={i}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            +{r.points} {r.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-col gap-1">
                      {!l.is_primary && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={async () => {
                            await setPrimaryRowFile(row.id, l.id);
                            onChanged();
                          }}
                        >
                          <Star className="mr-1 h-3 w-3" /> Principal
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-destructive"
                        onClick={async () => {
                          await detachRowFile(l.id);
                          onChanged();
                        }}
                      >
                        <Link2Off className="mr-1 h-3 w-3" /> Remover
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">Associar manualmente</p>
            <div className="flex gap-2">
              <Input
                placeholder="Buscar por nome ou caminho…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="text-xs"
              />
              <Input
                placeholder="pág."
                value={page}
                onChange={(e) => setPage(e.target.value.replace(/\D/g, ""))}
                className="w-20 text-xs"
              />
            </div>
            <div className="mt-2 max-h-[220px] overflow-auto rounded-lg border border-border">
              {filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="flex w-full items-center gap-2 border-b border-border/60 p-2 text-left text-[11px] hover:bg-muted/40"
                  onClick={async () => {
                    try {
                      await attachFileManually({
                        batchId,
                        rowId: row.id,
                        fileId: f.id,
                        pageNumber: page ? parseInt(page, 10) : null,
                        makePrimary: links.length === 0,
                      });
                      toast.success("Comprovante associado");
                      onChanged();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Falha ao associar");
                    }
                  }}
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono">
                    {f.original_path ?? f.file_name}
                  </span>
                  {f.page_count && (
                    <span className="ml-auto text-muted-foreground">
                      {f.page_count}p
                    </span>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  Nenhum arquivo encontrado no ZIP deste lote.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}