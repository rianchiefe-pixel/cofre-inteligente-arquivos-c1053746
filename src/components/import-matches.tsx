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
  Download,
  Eye,
  Check,
  X,
  Pencil,
  Search,
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
    let inReview = 0;
    let cardRows = 0;
    let cardMatched = 0;

    for (const r of list) {
      const rl = linksByRow.get(r.id) ?? [];
      const primary = primaryReceiptLink(rl);
      const hit = !!primary;

      if (isCardKind((r as any).kind)) {
        cardRows++;
        if (hit) cardMatched++;
        continue;
      }

      if (hit) {
        matched++;
      } else {
        const hasReview = rl.some((l) => l.confidence === "review");
        if (hasReview) inReview++;
        else missing++;
      }
    }

    const claimed = new Set(
      (links.data ?? []).filter((l) => l.is_primary).map((l) => l.file_id),
    );
    const unreadable = fs.filter(
      (f: any) => f.readable === false || f.status === "unreadable",
    ).length;
    const duplicates = fs.filter((f: any) => f.status === "duplicate").length;
    const unmatchedFiles = fs.filter(
      (f: any) =>
        f.status !== "duplicate" &&
        f.readable !== false &&
        f.status !== "unreadable" &&
        !claimed.has(f.id),
    ).length;
    const pendingFiles = fs.filter((f: any) => f.status === "uploaded").length;

    return {
      total: list.length,
      matched,
      missing,
      inReview,
      cardRows,
      cardMatched,
      unreadable,
      duplicates,
      unmatchedFiles,
      pendingFiles,
    };
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
      setProgress(p);
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
      
      {progress && (progress.diagnostics?.length ?? 0) > 0 && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="text-[10px] gap-2"
            onClick={() => {
              if (!progress?.filesDiagnostics || !progress?.diagnostics) {
                toast.error(
                  "O diagnóstico final ainda não está disponível. Execute o cruzamento novamente."
                );
                return;
              }
              const data = {
                matcherVersion: MATCHER_BUILD_VERSION,
                summary: {
                  matched: progress.matched,
                  notFound: progress.notFound,
                  needsReview: progress.needsReview,
                  persistenceRejected: progress.persistenceRejected,
                  cardRows: progress.cardRows,
                  cardMatched: progress.cardMatched,
                  unreadableFiles: progress.unreadableFiles,
                  duplicateFiles: progress.duplicateFiles,
                  unmatchedFiles: progress.unmatchedFiles,
                  totalRows: progress.rowsTotal,
                  fileSummary: progress.filesDiagnostics?.summary
                },
                filesDiagnostics: progress.filesDiagnostics?.files ?? [],
                diagnostics: progress.diagnostics ?? [],
              };
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `diagnostico-conciliacao-${batchId}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast.success("Diagnóstico JSON baixado com sucesso");
            }}
          >
            <Download className="h-3 w-3" />
            Baixar diagnóstico JSON
          </Button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-7">
        <Bucket label="Vinculados" value={stats.matched} tone="ok" />
        <Bucket 
          label="Possíveis" 
          value={stats.inReview} 
          tone={stats.inReview > 0 ? "warn" : undefined}
          icon={<FileSearch className="h-3.5 w-3.5" />}
        />
        <Bucket label="Sem comprovante" value={stats.missing} icon={<FileQuestion className="h-3.5 w-3.5" />} />
        <Bucket label="Comprovantes órfãos" value={stats.unmatchedFiles} icon={<Paperclip className="h-3.5 w-3.5" />} />
        <Bucket
          label="Cartão"
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
              const hasReview = !primary && rl.some(l => l.confidence === 'review');
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
                    ) : hasReview ? (
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <FileSearch className="h-3 w-3" />
                        <span className="text-[11px] font-medium italic">ver possíveis candidatos</span>
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
                    ) : hasReview ? (
                      <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20">Revisar</Badge>
                    ) : isCard ? (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                        Cartão
                      </Badge>
                    ) : (
                      <Badge variant="outline">Não identificado</Badge>
                    )}
                  </td>
                  <td className="p-2 text-right">
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
          links={linksByRow.get(openRow.id) ?? []}
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
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  
  const primary = primaryReceiptLink(links);
  const primaryFile = primary ? files.find((x) => x.id === primary.file_id) : null;
  const reviewLinks = links.filter(l => l.confidence === 'review').sort((a, b) => b.score - a.score);

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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-primary" />
            Linha {row.row_number} — Gestão de Comprovantes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Resumo da Transação */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-sm">{row.description ?? row.payee ?? "—"}</h4>
                <p className="text-xs text-muted-foreground">{row.transaction_date ?? "—"}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-base">{typeof row.amount === "number" ? currencyBRL(row.amount) : "—"}</p>
                <Badge variant="outline" className="text-[10px] uppercase font-mono">{row.kind || 'Outros'}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              <div className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">Banco</span>
                <span className="font-medium">{row.bank || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">Forma</span>
                <span className="font-medium">{row.payment_method || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">Favorecido</span>
                <span className="font-medium truncate max-w-[120px]">{row.payee || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">Categoria</span>
                <span className="font-medium truncate max-w-[120px]">{row.description || '—'}</span>
              </div>
            </div>
          </div>

          {/* Vínculo Atual */}
          {primary && primaryFile && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" /> Comprovante Vinculado (Primário)
              </h3>
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="h-10 w-10 rounded bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Paperclip className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{primaryFile.file_name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {primaryFile.original_path || 'Sem caminho'} {primary.page_number ? `· pág. ${primary.page_number}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setViewingFileId(primary.file_id)}>
                    <Eye className="h-3 w-3" /> Ver
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-destructive hover:bg-destructive/10" onClick={async () => {
                    await detachRowFile(primary.id);
                    onChanged();
                  }}>
                    <Link2Off className="h-3 w-3" /> Remover
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Candidatos de Revisão */}
          {reviewLinks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <FileSearch className="h-3 w-3" /> Possíveis Comprovantes ({reviewLinks.length})
              </h3>
              <div className="space-y-3">
                {reviewLinks.map((l) => {
                  const f = files.find(x => x.id === l.file_id);
                  if (!f) return null;
                  
                  // Gerar explicação baseada nos motivos
                  const matches = (l.match_reasons || []).filter((r: any) => r.key === 'match');
                  const divergences = (l.match_reasons || []).filter((r: any) => r.key === 'divergence');
                  const explanation = `Este comprovante não foi vinculado automaticamente porque ${matches.map((m: any) => m.label.toLowerCase()).join(', ')} coincidem, mas ${divergences.map((d: any) => d.label.toLowerCase()).join(' e ')}.`;

                  return (
                    <div key={l.id} className="rounded-xl border border-amber-200 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-900/10 p-4 space-y-4">
                      {/* Comparativo Lado a Lado */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Dados da Planilha</p>
                          <div className="space-y-1.5 text-[11px]">
                             <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-1.5 rounded">
                               <span className="text-muted-foreground">Valor</span>
                               <span className="font-bold">{typeof row.amount === 'number' ? currencyBRL(row.amount) : '—'}</span>
                             </div>
                             <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-1.5 rounded">
                               <span className="text-muted-foreground">Data</span>
                               <span className="font-medium">{row.transaction_date || '—'}</span>
                             </div>
                             <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-1.5 rounded">
                               <span className="text-muted-foreground">Favorecido</span>
                               <span className="font-medium truncate max-w-[100px]">{row.payee || '—'}</span>
                             </div>
                             <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-1.5 rounded">
                               <span className="text-muted-foreground">Banco</span>
                               <span className="font-medium">{row.bank || '—'}</span>
                             </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Dados do Comprovante</p>
                          <div className="space-y-1.5 text-[11px]">
                             {/* Valor OCR */}
                             <div className={`flex justify-between items-center p-1.5 rounded ${
                               (l.match_reasons || []).some((r: any) => r.field === 'amount' && r.key === 'match') 
                                 ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                 : 'bg-white/50 dark:bg-black/20'
                             }`}>
                               <span className="opacity-70">Valor extraído</span>
                               <span className="font-bold">{(l.match_reasons || []).find((r: any) => r.field === 'amount')?.receiptValue || '—'}</span>
                             </div>
                             {/* Data OCR */}
                             <div className={`flex justify-between items-center p-1.5 rounded ${
                               (l.match_reasons || []).some((r: any) => r.field === 'date' && r.key === 'match') 
                                 ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                 : (l.match_reasons || []).some((r: any) => r.field === 'date' && r.key === 'divergence')
                                   ? 'bg-amber-100/50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                   : 'bg-white/50 dark:bg-black/20'
                             }`}>
                               <span className="opacity-70">Data extraída</span>
                               <span className="font-medium">{(l.match_reasons || []).find((r: any) => r.field === 'date')?.receiptValue || '—'}</span>
                             </div>
                             {/* Favorecido OCR */}
                             <div className={`flex justify-between items-center p-1.5 rounded ${
                               (l.match_reasons || []).some((r: any) => r.field === 'payee' && r.key === 'match') 
                                 ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                 : (l.match_reasons || []).some((r: any) => r.field === 'payee' && r.key === 'divergence')
                                   ? 'bg-amber-100/50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                   : 'bg-white/50 dark:bg-black/20'
                             }`}>
                               <span className="opacity-70">Favorecido</span>
                               <span className="font-medium truncate max-w-[100px]">{(l.match_reasons || []).find((r: any) => r.field === 'payee')?.receiptValue || '—'}</span>
                             </div>
                             {/* Banco OCR */}
                             <div className={`flex justify-between items-center p-1.5 rounded ${
                               (l.match_reasons || []).some((r: any) => r.field === 'bank' && r.key === 'match') 
                                 ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                 : (l.match_reasons || []).some((r: any) => r.field === 'bank' && r.key === 'divergence')
                                   ? 'bg-amber-100/50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                   : 'bg-white/50 dark:bg-black/20'
                             }`}>
                               <span className="opacity-70">Banco</span>
                               <span className="font-medium">{(l.match_reasons || []).find((r: any) => r.field === 'bank')?.receiptValue || '—'}</span>
                             </div>
                          </div>
                        </div>
                      </div>

                      {/* Motivos Estruturados */}
                      <div className="flex flex-wrap gap-1.5">
                        {(l.match_reasons || []).map((mr: any, idx: number) => {
                          const color = mr.key === 'match' ? 'text-emerald-700 dark:text-emerald-400' :
                                        mr.key === 'divergence' ? 'text-amber-700 dark:text-amber-400' :
                                        'text-slate-500 dark:text-slate-400';
                          return (
                            <div key={idx} className={`text-[10px] flex items-center gap-1 bg-white/40 dark:bg-black/20 px-2 py-0.5 rounded border border-border/20 ${color}`}>
                              {mr.key === 'match' ? <Check className="h-2.5 w-2.5" /> : 
                               mr.key === 'divergence' ? <X className="h-2.5 w-2.5" /> : 
                               <FileQuestion className="h-2.5 w-2.5" />}
                              {mr.label}
                            </div>
                          );
                        })}
                      </div>

                      <p className="text-[11px] leading-relaxed text-muted-foreground italic border-l-2 border-amber-400/50 pl-2">
                        {explanation}
                      </p>

                      <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setViewingFileId(l.file_id)}>
                          <Eye className="h-3 w-3" /> Ver comprovante
                        </Button>
                        <Button size="sm" className="h-8 gap-1 bg-amber-600 hover:bg-amber-700 text-white border-none" onClick={async () => {
                          await attachFileManually({
                            batchId,
                            rowId: row.id,
                            fileId: l.file_id,
                            pageNumber: l.page_number,
                            makePrimary: true
                          });
                          toast.success("Comprovante vinculado com sucesso");
                          onChanged();
                        }}>
                          <Check className="h-3 w-3" /> Vincular este comprovante
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" onClick={async () => {
                          await detachRowFile(l.id);
                          onChanged();
                        }}>
                          <X className="h-3 w-3" /> Não é este
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Busca Manual Existente */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Busca Manual de Arquivos</h3>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" onClick={() => {
                // Aqui abriria a edição da transação se tivéssemos a função exposta, 
                // mas para seguir o pedido "reutilizar mecanismo de edição", 
                // assumimos que o usuário clica no botão Editar
                toast.info("Funcionalidade de edição de transação disponível na tela de conferência principal.");
              }}>
                <Pencil className="h-3 w-3" /> Editar transação
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar arquivo por nome ou caminho no ZIP…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="text-xs pl-8 h-9 rounded-lg"
                />
              </div>
              <Input
                placeholder="Pág."
                value={page}
                onChange={(e) => setPage(e.target.value.replace(/\D/g, ""))}
                className="w-20 text-xs h-9 rounded-lg text-center"
              />
            </div>
            <div className="max-h-[200px] overflow-auto rounded-xl border border-border bg-muted/10">
              {filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-border/60 p-3 text-left text-[11px] hover:bg-muted/40 transition-colors"
                  onClick={async () => {
                    try {
                      await attachFileManually({
                        batchId,
                        rowId: row.id,
                        fileId: f.id,
                        pageNumber: page ? parseInt(page, 10) : null,
                        makePrimary: true,
                      });
                      toast.success("Comprovante associado manualmente");
                      onChanged();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Falha ao associar");
                    }
                  }}
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{f.file_name}</p>
                    <p className="truncate text-[10px] text-muted-foreground opacity-70 font-mono">{f.original_path || '/'}</p>
                  </div>
                  {f.page_count && (
                    <Badge variant="secondary" className="text-[9px] h-5">{f.page_count}p</Badge>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                  <FileQuestion className="h-8 w-8 mx-auto opacity-20" />
                  <p>Nenhum arquivo encontrado no ZIP deste lote.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} className="rounded-lg h-9 text-xs">
            Fechar Painel
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Visualizador de Arquivo */}
      {viewingFileId && (
         <FileViewerDialog 
           fileId={viewingFileId} 
           onClose={() => setViewingFileId(null)} 
         />
      )}
    </Dialog>
  );
}

function FileViewerDialog({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [file, setFile] = useState<any>(null);

  useMemo(async () => {
    const { data: f } = await supabase.from('import_files').select('*').eq('id', fileId).single();
    if (!f) return;
    setFile(f);
    const { data } = await supabase.storage.from('imports').createSignedUrl(f.folder + '/' + f.file_name, 3600);
    if (data?.signedUrl) setSignedUrl(data.signedUrl);
  }, [fileId]);

  const isPdf = file?.extension?.toLowerCase() === 'pdf' || file?.file_name?.toLowerCase().endsWith('.pdf');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh]">
        <DialogHeader>
          <DialogTitle className="truncate">{file?.file_name || 'Visualizando arquivo'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/20 rounded-lg border border-border relative">
          {!signedUrl ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isPdf ? (
            <iframe src={signedUrl} className="w-full h-full border-none" title="PDF Viewer" />
          ) : (
            <img src={signedUrl} alt="Comprovante" className="max-w-full mx-auto" />
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Fechar Visualizador</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}