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
  Paperclip,
  CreditCard,
  FileWarning,
  Copy,
  FileQuestion,
} from "lucide-react";
import { toast } from "sonner";
import {
  matchBatchReceipts,
  attachFileManually,
  detachRowFile,
  type MatchProgress,
  MATCHER_BUILD_VERSION,
} from "@/lib/receipt-matcher";

import { reprocessBatchFacts } from "@/lib/zip-import";
import { currencyBRL } from "@/lib/format";
import { isCardKind, ROW_KIND_LABEL, type RowKind } from "@/lib/import-kind";

const ACCEPTED_RECEIPT_CONFIDENCES = new Set(["high", "very_high"]);

function isAcceptedReceiptLink(link: any): boolean {
  return !!link && (link.is_manual || ACCEPTED_RECEIPT_CONFIDENCES.has(String(link.confidence ?? "")));
}

function primaryReceiptLink(links: any[]): any | null {
  return links.find((l) => l.is_primary && isAcceptedReceiptLink(l)) ?? null;
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
        .select("id, row_number, transaction_date, amount, payee, description, file_name, folder_path, source_id, invoice_number, bank, card, card_last4, payment_method, holder, page_number, kind")
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
        .select("id, file_name, original_path, folder, extension, page_count, status, readable, duplicate_of")
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
    const fs = files.data ?? [];
    let matched = 0;
    let missing = 0;
    let cardRows = 0;
    let cardMatched = 0;
    for (const r of list) {
      const rl = linksByRow.get(r.id) ?? [];
      const hit = !!primaryReceiptLink(rl);
      if (isCardKind((r as any).kind)) {
        cardRows++;
        if (hit) cardMatched++;
        continue;
      }
      if (hit) matched++;
      else missing++;
    }
    const claimed = new Set((links.data ?? []).filter((l) => l.is_primary).map((l) => l.file_id));
    const unreadable = fs.filter((f: any) => f.readable === false || f.status === "unreadable").length;
    const duplicates = fs.filter((f: any) => f.status === "duplicate").length;
    const unmatchedFiles = fs.filter(
      (f: any) =>
        f.status !== "duplicate" &&
        f.readable !== false &&
        f.status !== "unreadable" &&
        !claimed.has(f.id),
    ).length;
    const pendingFiles = fs.filter((f: any) => f.status === "uploaded").length;
    return { total: list.length, matched, missing, cardRows, cardMatched, unreadable, duplicates, unmatchedFiles, pendingFiles };
  }, [rows.data, linksByRow, links.data, files.data]);

  async function runMatch() {
    setBusy(true);
    console.log(`[Matcher] Iniciando cruzamento - Versão: ${MATCHER_BUILD_VERSION}`);

    setProgress({
      rowsTotal: rows.data?.length ?? 0,
      rowsDone: 0,
      matched: 0,
      needsReview: 0,
      notFound: 0,
      cardRows: 0,
      cardMatched: 0,
      unreadableFiles: 0,
      unmatchedFiles: 0,
      duplicateFiles: 0,
      persistenceRejected: 0,
    });

    try {
      // Re-normaliza valores/datas dos comprovantes com o parser BRL corrigido
      // antes de recruzar — garante que "R$ 5.33" seja lido como 5,33.
      const rp = await reprocessBatchFacts(batchId);
      if (rp.total > 0) {
        toast.message(`Comprovantes reprocessados: ${rp.updated}/${rp.total}`);
      }
      const p = await matchBatchReceipts(batchId, { onProgress: setProgress });
      toast.success(
        <div className="space-y-1">
          <p className="font-semibold">{p.matched} associados com sucesso</p>
          <div className="text-[10px] opacity-90 grid grid-cols-1 gap-0.5">
            {p.notFound > 0 && <span>• {p.notFound} sem candidato compatível</span>}
            {p.needsReview > 0 && <span>• {p.needsReview} bloqueados por ambiguidade</span>}
            {p.persistenceRejected > 0 && (
              <span>• {p.persistenceRejected} rejeitados pela validação de persistência</span>
            )}
            {p.unreadableFiles > 0 && <span>• {p.unreadableFiles} ilegíveis</span>}
            {p.duplicateFiles > 0 && <span>• {p.duplicateFiles} duplicados</span>}
            {p.unmatchedFiles > 0 && <span>• {p.unmatchedFiles} arquivos do ZIP não utilizados</span>}

          </div>
        </div>,
        { duration: 6000 }
      );
      qc.invalidateQueries({ queryKey: ["import-row-files", batchId] });
      qc.invalidateQueries({ queryKey: ["import-files-simple", batchId] });
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
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded opacity-50 font-mono">
          v.{MATCHER_BUILD_VERSION}
        </span>
        <div className="ml-auto text-xs text-muted-foreground">

          {stats.total} linhas · {stats.pendingFiles > 0 ? `${stats.pendingFiles} arquivos ainda processando` : "análise completa"}
        </div>
        <Button
          size="sm"
          onClick={runMatch}
          disabled={busy || rows.isLoading || stats.pendingFiles > 0}
          title={stats.pendingFiles > 0 ? "Aguarde a análise de todos os comprovantes terminar" : undefined}
        >
          {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
          Cruzar comprovantes
        </Button>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Bucket label="Vinculados" value={stats.matched} tone="ok" />
        <Bucket label="Sem comprovante" value={stats.missing} icon={<FileQuestion className="h-3.5 w-3.5" />} />
        <Bucket label="Comprovantes órfãos" value={stats.unmatchedFiles} icon={<FileSearch className="h-3.5 w-3.5" />} />
        <Bucket
          label="Cartão de crédito"
          value={`${stats.cardMatched}/${stats.cardRows}`}
          icon={<CreditCard className="h-3.5 w-3.5" />}
          tone="card"
        />
        <Bucket
          label="Ilegíveis"
          value={stats.unreadable}
          icon={<FileWarning className="h-3.5 w-3.5" />}
          tone={stats.unreadable ? "warn" : undefined}
        />
        <Bucket
          label="Duplicidades"
          value={stats.duplicates}
          icon={<Copy className="h-3.5 w-3.5" />}
        />
      </div>

      {busy && progress && progress.rowsTotal > 0 && (
        <div className="mb-3 space-y-1.5">
          <Progress value={(progress.rowsDone / progress.rowsTotal) * 100} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="font-medium">{progress.rowsDone}/{progress.rowsTotal} processados</span>
            <span className="text-emerald-600 dark:text-emerald-400">• {progress.matched} associados</span>
            {progress.notFound > 0 && <span>• {progress.notFound} sem candidato</span>}
            {progress.needsReview > 0 && <span className="text-amber-600 dark:text-amber-400">• {progress.needsReview} ambíguos</span>}
            {progress.persistenceRejected > 0 && (
              <span className="text-rose-600 dark:text-rose-400">• {progress.persistenceRejected} erro de valor</span>
            )}
            {progress.unreadableFiles > 0 && <span className="text-rose-600 dark:text-rose-400">• {progress.unreadableFiles} ilegíveis</span>}

          </div>
        </div>
      )}

      <div className="max-h-[520px] overflow-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 text-left">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Data</th>
              <th className="p-2">Descrição</th>
              <th className="p-2">Tipo</th>
              <th className="p-2 text-right">Valor</th>
              <th className="p-2">Comprovante</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r) => {
              const rl = (linksByRow.get(r.id) ?? []).slice().sort((a, b) => b.score - a.score);
              const primary = primaryReceiptLink(rl);
              const primaryFile = primary ? fileById.get(primary.file_id) : null;
              const isCard = isCardKind((r as any).kind);
              const kindLabel = (r as any).kind ? ROW_KIND_LABEL[(r as any).kind as RowKind] ?? "—" : "—";
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="p-2 text-muted-foreground">{r.row_number}</td>
                  <td className="p-2">{r.transaction_date ?? "—"}</td>
                  <td className="p-2 max-w-[240px] truncate">{r.description ?? r.payee ?? "—"}</td>
                  <td className="p-2">
                    {isCard ? (
                      <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400">
                        <CreditCard className="h-3 w-3" />
                        {kindLabel}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">{kindLabel}</span>
                    )}
                  </td>
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
                      </div>
                    ) : isCard ? (
                      <span className="text-muted-foreground italic">segregado — cartão</span>
                    ) : (
                      <span className="text-muted-foreground">não identificado</span>
                    )}
                  </td>
                  <td className="p-2 text-center">
                    {primary ? (
                      <Badge className="bg-emerald-600 text-white">Identificado</Badge>
                    ) : isCard ? (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                        Cartão
                      </Badge>
                    ) : (
                      <Badge variant="outline">Não identificado</Badge>
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
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
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
          links={(linksByRow.get(openRow.id) ?? []).filter(isAcceptedReceiptLink).sort((a, b) => b.score - a.score)}
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

function Bucket({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  tone?: "ok" | "warn" | "card";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
      ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
      : tone === "card"
      ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
      : "border-border bg-card text-foreground";
  return (
    <div className={`rounded-xl border p-3 ${toneCls}`}>
      <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
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
  const primary = primaryReceiptLink(links);
  const primaryFile = primary ? files.find((x) => x.id === primary.file_id) : null;

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
            <p className="mb-2 text-xs font-semibold">Comprovante vinculado</p>
            {primary && primaryFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs">
                <Paperclip className="h-3 w-3 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                  {primaryFile.original_path ?? primaryFile.file_name}
                  {primary.page_number ? ` · p.${primary.page_number}` : ""}
                </span>
                {primary.is_manual && (
                  <Badge variant="outline" className="text-[10px]">
                    manual
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-destructive"
                  onClick={async () => {
                    await detachRowFile(primary.id);
                    onChanged();
                  }}
                >
                  <Link2Off className="mr-1 h-3 w-3" /> Remover
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum comprovante identificado — associe manualmente abaixo.
              </p>
            )}
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
                        makePrimary: true,
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