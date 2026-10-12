/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ForecastItem, ForecastKind } from "@/lib/forecast-engine";
import {
  deleteForecastItem,
  deleteForecastItemMonths,
  editForecastItem,
  editForecastItemFuture,
  isRecurring,
  isSeriesEditable,
  type EditScope,
  type ForecastEdit,
} from "@/lib/forecast-actions";
import { paymentMethodLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KINDS: [ForecastKind, string][] = [
  ["fixed", "Gasto fixo"],
  ["variable", "Gasto variável"],
  ["expected", "Despesa prevista"],
  ["investment", "Investimento"],
];
const RECURRENCES = [
  ["unica", "Único"],
  ["mensal", "Mensal"],
  ["bimestral", "A cada 2 meses"],
  ["trimestral", "A cada 3 meses"],
  ["semestral", "A cada 6 meses"],
  ["anual", "Anual"],
  ["quinzenal", "Quinzenal"],
  ["semanal", "Semanal"],
  ["diaria", "Diária"],
];

const monthLabel = (date: string) =>
  format(new Date(`${date}T12:00:00`), "MMMM 'de' yyyy", { locale: ptBR });

function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: any[][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ForecastItemActions({
  item,
  data,
  onChanged,
}: {
  item: ForecastItem;
  data: any;
  onChanged: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<ForecastEdit | null>(null);
  const recurring = isRecurring(item);
  const series = isSeriesEditable(item);
  const installmentFuture =
    item.sourceType === "credit_card_installment" &&
    (item.installmentTotal ?? 1) > (item.installmentCurrent ?? 1);
  const futureEditable =
    !series && item.editSource !== "receipt" && (item.sourceType === "history_estimate" || installmentFuture);
  const editable = series || item.editSource === "receipt" || item.sourceType === "history_estimate" || item.sourceType === "credit_card_installment" || item.sourceType === "card_statement";

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (!editOpen) return;
    const normalizedRec = ["once", "unica", "sem_recorrencia", "", null, undefined].includes(item.recurrence as any)
      ? "unica"
      : item.recurrence === "monthly" ? "mensal" : String(item.recurrence);
    setForm({
      description: item.description,
      amount: (item.amountCents / 100).toFixed(2).replace(".", ","),
      date: item.date,
      kind: item.kind,
      categoryId: item.categoryId ?? "none",
      accountId: item.accountId ?? "none",
      bankId: item.bankId ?? "none",
      cardId: item.cardId ?? "none",
      paymentMethod: item.paymentMethod ?? "none",
      recurrence: normalizedRec,
    });
  }, [editOpen, item]);

  const edit = useMutation({
    mutationFn: ({ e, scope }: { e: ForecastEdit; scope: EditScope }) => editForecastItem(item, e, scope),
    onSuccess: () => {
      toast.success("Lançamento atualizado. Totais recalculados.");
      setPendingEdit(null);
      setEditOpen(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });
  const [skipMonths, setSkipMonths] = useState("3");
  const delMonths = useMutation({
    mutationFn: (n: number) => deleteForecastItemMonths(item, n),
    onSuccess: () => {
      toast.success("Previsão atualizada.");
      setDeleteOpen(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir"),
  });
  const del = useMutation({
    mutationFn: (scope: EditScope) => deleteForecastItem(item, scope),
    onSuccess: () => {
      toast.success("Previsão atualizada.");
      setDeleteOpen(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir"),
  });

  const submit = () => {
    const amount = Number(String(form.amount).replace(/\./g, "").replace(",", "."));
    if (!form.description.trim() || !amount || amount <= 0 || !form.date)
      return toast.error("Informe descrição, valor e data.");
    const e: ForecastEdit = {
      description: form.description.trim(),
      amount,
      date: form.date,
      kind: form.kind,
      categoryId: form.categoryId === "none" ? null : form.categoryId,
      accountId: form.accountId === "none" ? null : form.accountId,
      bankId: form.bankId === "none" ? null : form.bankId,
      cardId: form.cardId === "none" ? null : form.cardId,
      paymentMethod: form.paymentMethod === "none" ? null : form.paymentMethod,
      recurrence: form.recurrence,
    };
    if (recurring) setPendingEdit(e);
    else edit.mutate({ e, scope: series ? "all" : "this" });
  };

  const month = monthLabel(item.occurrenceDate ?? item.date);
  const none = [["none", "—"]];
  const readOnlySeries = !series && item.editSource !== "receipt";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ações do lançamento">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {editable && (
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> {recurring ? "Excluir / Parar recorrência" : "Excluir da previsão"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar lançamento previsto</DialogTitle>
            <DialogDescription>
              {readOnlySeries
                ? `Este item vem de ${item.originLabel.toLowerCase()}. A alteração vale somente para ${month} e não muda o registro original.`
                : item.originLabel}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Descrição</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input value={form.amount} inputMode="decimal" onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Data / vencimento</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Classificação</Label>
                <Sel value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={KINDS} />
              </div>
              {series && (
                <div className="space-y-1">
                  <Label>Recorrência</Label>
                  <Sel value={form.recurrence} onChange={(v) => setForm({ ...form, recurrence: v })} options={RECURRENCES} />
                </div>
              )}
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Sel value={form.categoryId} onChange={(v) => setForm({ ...form, categoryId: v })} options={[...none, ...(data?.categories ?? []).map((c: any) => [c.id, c.name])]} />
              </div>
              <div className="space-y-1">
                <Label>Banco</Label>
                <Sel value={form.bankId} onChange={(v) => setForm({ ...form, bankId: v })} options={[...none, ...(data?.banks ?? []).map((c: any) => [c.id, c.name])]} />
              </div>
              <div className="space-y-1">
                <Label>Conta</Label>
                <Sel value={form.accountId} onChange={(v) => setForm({ ...form, accountId: v })} options={[...none, ...(data?.accounts ?? []).map((c: any) => [c.id, c.nickname])]} />
              </div>
              <div className="space-y-1">
                <Label>Cartão</Label>
                <Sel value={form.cardId} onChange={(v) => setForm({ ...form, cardId: v })} options={[...none, ...(data?.cards ?? []).map((c: any) => [c.id, c.name])]} />
              </div>
              <div className="space-y-1">
                <Label>Forma de pagamento</Label>
                <Sel value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} options={[...none, ...Object.entries(paymentMethodLabel)]} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={edit.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingEdit} onOpenChange={(o) => !o && setPendingEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar valor</DialogTitle>
            <DialogDescription>
              Você está alterando um lançamento recorrente. Onde deseja aplicar a alteração?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button variant="outline" disabled={edit.isPending} onClick={() => edit.mutate({ e: pendingEdit!, scope: "this" })}>
              Somente {month}
            </Button>
            <Button variant="outline" disabled={edit.isPending} onClick={() => edit.mutate({ e: pendingEdit!, scope: "future" })}>
              {month[0].toUpperCase() + month.slice(1)} e próximos meses
            </Button>
            <Button variant="outline" disabled={edit.isPending} onClick={() => edit.mutate({ e: pendingEdit!, scope: "all" })}>
              Toda a recorrência
            </Button>
            <Button variant="ghost" onClick={() => setPendingEdit(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir lançamento</DialogTitle>
            <DialogDescription>
              {recurring
                ? `Como deseja aplicar esta exclusão em "${item.description}"?`
                : `Remover "${item.description}" da previsão de ${month}? O registro original não é apagado.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button variant="outline" disabled={del.isPending} onClick={() => del.mutate("this")}>
              Somente {month}
            </Button>
            <div className="flex items-center gap-2 rounded-md border p-2">
              <span className="text-sm">Excluir {month} e os próximos</span>
              <Input
                type="number"
                min={1}
                max={120}
                className="h-8 w-20"
                value={skipMonths}
                onChange={(e) => setSkipMonths(e.target.value)}
              />
              <span className="text-sm">meses</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={delMonths.isPending || !(Number(skipMonths) >= 1)}
                onClick={() => delMonths.mutate(Number(skipMonths))}
              >
                Excluir
              </Button>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">O mês atual conta como 1. Ex.: 3 = este mês e os 2 seguintes.</p>
            {recurring && (
              <>
                <Button variant="outline" disabled={del.isPending} onClick={() => del.mutate("future")}>
                  Este mês e próximos (meses anteriores ficam no histórico)
                </Button>
                <Button variant="destructive" disabled={del.isPending} onClick={() => del.mutate("all")}>
                  Encerrar toda a recorrência
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
