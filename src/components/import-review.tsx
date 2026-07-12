import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, CheckCircle2, XCircle, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  classifyImportRow,
  approveImportRow,
  rejectImportRow,
} from "@/lib/import.functions";
import { currencyBRL } from "@/lib/format";

type Meta = Record<
  string,
  { original?: string | null; source?: string; confidence?: number; rationale?: string }
>;

export function ImportReview({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const classify = useServerFn(classifyImportRow);
  const approve = useServerFn(approveImportRow);
  const reject = useServerFn(rejectImportRow);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: ["import-rows", batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_rows")
        .select("*")
        .eq("batch_id", batchId)
        .order("row_number")
        .limit(2000);
      return data ?? [];
    },
    enabled: !!batchId,
  });

  const stats = useMemo(() => {
    const list = rows.data ?? [];
    return {
      total: list.length,
      classified: list.filter((r: any) => r.ai_status === "classified").length,
      pending: list.filter((r: any) => r.review_status === "pending").length,
      approved: list.filter((r: any) => r.review_status === "approved").length,
      rejected: list.filter((r: any) => r.review_status === "rejected").length,
    };
  }, [rows.data]);

  async function classifyAll() {
    const list = (rows.data ?? []).filter(
      (r: any) => r.ai_status !== "classified",
    );
    if (list.length === 0) {
      toast.info("Todas as linhas já estão classificadas");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: list.length });
    try {
      for (let i = 0; i < list.length; i++) {
        try {
          await classify({ data: { rowId: list[i].id } });
        } catch (e: any) {
          console.warn("classify error", list[i].id, e?.message);
        }
        setProgress({ done: i + 1, total: list.length });
      }
      toast.success(`${list.length} linhas classificadas`);
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["import-rows", batchId] });
    }
  }

  const openRow = (rows.data ?? []).find((r: any) => r.id === openId);

  return (
    <Card className="p-5">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Classificação com IA</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Total {stats.total}</span>
          <span>· Classificadas {stats.classified}</span>
          <span>· Aprovadas {stats.approved}</span>
          <span>· Rejeitadas {stats.rejected}</span>
        </div>
        <Button size="sm" onClick={classifyAll} disabled={busy || rows.isLoading}>
          {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
          Classificar pendentes
        </Button>
      </header>

      {busy && progress.total > 0 && (
        <div className="mb-3">
          <Progress value={(progress.done / progress.total) * 100} />
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.done}/{progress.total} — nenhum lançamento é aprovado automaticamente
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
              <th className="p-2">Categoria</th>
              <th className="p-2">Tipo</th>
              <th className="p-2 text-right">Valor</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 text-muted-foreground">{r.row_number}</td>
                <td className="p-2">{r.transaction_date ?? "—"}</td>
                <td className="p-2 max-w-[260px] truncate">{r.description ?? r.payee ?? "—"}</td>
                <td className="p-2">{r.category ?? "—"}</td>
                <td className="p-2">
                  {r.transaction_type ? (
                    <Badge
                      variant={r.transaction_type === "INVESTIMENTO" ? "secondary" : "outline"}
                    >
                      {r.transaction_type}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {typeof r.amount === "number" ? currencyBRL(r.amount) : "—"}
                </td>
                <td className="p-2 text-center">
                  {r.review_status === "approved" ? (
                    <Badge className="bg-emerald-600 text-white">aprovado</Badge>
                  ) : r.review_status === "rejected" ? (
                    <Badge variant="destructive">rejeitado</Badge>
                  ) : r.ai_status === "classified" ? (
                    <Badge variant="secondary">a revisar</Badge>
                  ) : r.ai_status === "error" ? (
                    <Badge variant="destructive">erro</Badge>
                  ) : (
                    <Badge variant="outline">pendente</Badge>
                  )}
                </td>
                <td className="p-2">
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
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
        <RowReviewDialog
          row={openRow}
          onClose={() => setOpenId(null)}
          onApprove={async (overrides) => {
            try {
              await approve({ data: { rowId: openRow.id, overrides } });
              toast.success("Aprovado — preferências registradas");
              setOpenId(null);
              qc.invalidateQueries({ queryKey: ["import-rows", batchId] });
            } catch (e: any) {
              toast.error(e?.message ?? "Falha ao aprovar");
            }
          }}
          onReject={async () => {
            try {
              await reject({ data: { rowId: openRow.id } });
              toast.success("Rejeitado");
              setOpenId(null);
              qc.invalidateQueries({ queryKey: ["import-rows", batchId] });
            } catch (e: any) {
              toast.error(e?.message ?? "Falha ao rejeitar");
            }
          }}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Review dialog — shows original vs reorganized + source + confidence + rationale
// ---------------------------------------------------------------------------

const FIELDS: Array<{ key: string; label: string; type?: "number" | "textarea" }> = [
  { key: "transaction_date", label: "Data" },
  { key: "amount", label: "Valor", type: "number" },
  { key: "currency", label: "Moeda" },
  { key: "transaction_type", label: "Tipo (DESPESA | INVESTIMENTO)" },
  { key: "category", label: "Categoria" },
  { key: "subcategory", label: "Subcategoria" },
  { key: "description", label: "Descrição" },
  { key: "payee", label: "Favorecido / estabelecimento" },
  { key: "account", label: "Conta" },
  { key: "bank", label: "Banco" },
  { key: "card", label: "Cartão" },
  { key: "card_last4", label: "Final do cartão" },
  { key: "payment_method", label: "Forma de pagamento" },
  { key: "holder", label: "Titular / pagador" },
  { key: "file_name", label: "Nome do arquivo" },
  { key: "folder_path", label: "Caminho da pasta" },
  { key: "source_id", label: "ID de origem" },
  { key: "invoice_number", label: "Nº da fatura" },
  { key: "page_number", label: "Página" },
  { key: "notes", label: "Observações", type: "textarea" },
];

function RowReviewDialog({
  row,
  onClose,
  onApprove,
  onReject,
}: {
  row: any;
  onClose: () => void;
  onApprove: (overrides: Record<string, unknown>) => void;
  onReject: () => void;
}) {
  const meta: Meta = row.ai_meta ?? {};
  const [values, setValues] = useState<Record<string, any>>(() => {
    const out: Record<string, any> = {};
    for (const f of FIELDS) out[f.key] = row[f.key] ?? "";
    return out;
  });

  function submit() {
    const overrides: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const v = values[f.key];
      if (v === "" || v === undefined) continue;
      if (f.type === "number") {
        const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
        if (Number.isFinite(n)) overrides[f.key] = n;
      } else {
        overrides[f.key] = String(v);
      }
    }
    onApprove(overrides);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Linha {row.row_number} — revisão</DialogTitle>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-2">
          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p className="font-semibold text-foreground">Dados originais preservados</p>
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
              {JSON.stringify(row.raw_data, null, 2)}
            </pre>
          </div>

          <div className="grid gap-3">
            {FIELDS.map((f) => {
              const m = meta[f.key] ?? {};
              const original = m.original ?? row.raw_data?.[f.key] ?? "";
              const conf =
                typeof m.confidence === "number" ? Math.round(m.confidence * 100) : null;
              return (
                <div key={f.key} className="rounded-lg border border-border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label className="text-xs font-semibold">{f.label}</Label>
                    {conf !== null && (
                      <span
                        className={`text-[10px] font-medium ${
                          conf >= 80
                            ? "text-emerald-600"
                            : conf >= 50
                            ? "text-amber-600"
                            : "text-destructive"
                        }`}
                      >
                        confiança {conf}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Original: <span className="font-mono">{String(original || "—")}</span>
                    {m.source ? <> · origem: {m.source}</> : null}
                  </p>
                  {f.type === "textarea" ? (
                    <Textarea
                      className="mt-2 text-xs"
                      rows={2}
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      className="mt-2 text-xs"
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.value }))
                      }
                    />
                  )}
                  {m.rationale && (
                    <p className="mt-1 text-[11px] italic text-muted-foreground">
                      {m.rationale}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onReject}>
            <XCircle className="mr-2 h-4 w-4" /> Rejeitar
          </Button>
          <Button onClick={submit}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar e aprender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}