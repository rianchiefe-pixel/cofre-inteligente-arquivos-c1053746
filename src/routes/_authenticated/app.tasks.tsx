import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { currencyBRL, dateBR, periodicityLabel, taskStatusLabel } from "@/lib/format";
import {
  ListTodo, Plus, Search, AlertTriangle, CheckCircle2, Clock, ExternalLink, CalendarDays, Check, Pencil, Trash2,
} from "lucide-react";
import { TaskEditor, emptyTask, type TaskForm } from "@/components/property-tabs";
import { LoadingState, ErrorState } from "@/components/query-states";
import { useDeadlines } from "@/hooks/use-deadlines";
import { urgencyLabel, type AgendaItem, type Urgency } from "@/lib/deadlines";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/app/tasks")({
  head: () => ({
    meta: [
      { title: "Central de prazos e vencimentos — Meu Cofre" },
      { name: "description", content: "Tarefas manuais, obrigações PF e obrigações dos imóveis reunidas por urgência de vencimento." },
    ],
  }),
  component: TasksPage,
});

const URGENCY_STYLE: Record<Urgency, { border: string; badge: string; dot: string }> = {
  vencido: { border: "border-destructive/60 bg-destructive/5", badge: "bg-destructive text-destructive-foreground", dot: "🔴" },
  hoje: { border: "border-orange-500/60 bg-orange-500/5", badge: "bg-orange-500 text-white", dot: "🟠" },
  urgente: { border: "border-amber-500/60 bg-amber-500/5", badge: "bg-amber-500 text-white", dot: "🟡" },
  atencao: { border: "border-amber-400/50 bg-amber-400/5", badge: "bg-amber-400 text-black", dot: "🟡" },
  normal: { border: "border-border/60", badge: "bg-secondary text-secondary-foreground", dot: "" },
  concluido: { border: "border-border/40 opacity-70", badge: "bg-success text-success-foreground", dot: "" },
};

type FilterKey = "all" | "overdue" | "today" | "next7" | "next30" | "pf" | "imoveis" | "manual" | "done";

function TasksPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? "")); }, []);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [fProperty, setFProperty] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TaskForm>(emptyTask);

  const deadlines = useDeadlines();

  const properties = useQuery({
    queryKey: ["properties-min"],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks-all"] });
    qc.invalidateQueries({ queryKey: ["obligations-all"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        user_id: userId, property_id: form.property_id ?? null,
        title: form.title, description: form.description || null,
        due_date: form.due_date || null, assignee: form.assignee || null,
        priority: form.priority, status: form.status, notes: form.notes || null,
        completed_at: form.status === "concluida" ? new Date().toISOString() : null,
      };
      if (form.id) {
        const { error } = await sb.from("property_tasks").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("property_tasks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Tarefa salva"); setOpen(false); setForm(emptyTask); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const quickStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      patch.completed_at = status === "concluida" ? new Date().toISOString() : null;
      const { data, error } = await sb.from("property_tasks").update(patch).eq("id", id).select("id, status");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("Nenhuma tarefa foi atualizada.");
      return data[0];
    },
    onSuccess: () => { toast.success("Status atualizado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar o status"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from("property_tasks").delete().eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("A exclusão não foi confirmada pelo banco de dados.");
    },
    onSuccess: () => { toast.success("Tarefa excluída"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível excluir a tarefa"),
  });

  // Marca a ocorrência atual da obrigação como paga. O vencimento cadastrado
  // permanece intacto: a próxima ocorrência é apenas calculada em memória.
  const payObligation = useMutation({
    mutationFn: async ({ id, dueDate }: { id: string; dueDate: string | null }) => {
      const patch = dueDate ? { status: "pago", due_date: dueDate } : { status: "pago" };
      const { data, error } = await sb.from("property_obligations").update(patch).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("A obrigação não foi atualizada.");
    },
    onSuccess: () => { toast.success("Obrigação marcada como paga"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar a obrigação"),
  });

  const reopenObligation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from("property_obligations").update({ status: "pendente" }).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("A obrigação não foi atualizada.");
    },
    onSuccess: () => { toast.success("Obrigação reaberta"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar a obrigação"),
  });

  const busy = save.isPending || quickStatus.isPending || remove.isPending || payObligation.isPending || reopenObligation.isPending;

  const openEdit = (t: any) => {
    setForm({
      id: t.id, title: t.title, description: t.description ?? "", due_date: t.due_date ?? "",
      assignee: t.assignee ?? "", priority: t.priority, status: t.status, notes: t.notes ?? "",
      property_id: t.property_id ?? null,
    });
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return deadlines.items.filter((i) => {
      if (filter !== "done" && i.urgency === "concluido") return false;
      if (filter === "done" && i.urgency !== "concluido") return false;
      if (filter === "overdue" && i.urgency !== "vencido") return false;
      if (filter === "today" && i.urgency !== "hoje") return false;
      if (filter === "next7" && !(i.daysLeft != null && i.daysLeft >= 0 && i.daysLeft <= 7)) return false;
      if (filter === "next30" && !(i.daysLeft != null && i.daysLeft >= 0 && i.daysLeft <= 30)) return false;
      if (filter === "pf" && i.source !== "pf") return false;
      if (filter === "imoveis" && i.source !== "imovel") return false;
      if (filter === "manual" && i.source !== "manual") return false;
      if (fProperty !== "all" && i.propertyId !== fProperty) return false;
      if (term && ![i.title, i.sourceLabel, i.notes].some((v) => String(v ?? "").toLowerCase().includes(term)))
        return false;
      return true;
    });
  }, [deadlines.items, q, filter, fProperty]);

  const counts = deadlines.counts;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Tarefas e vencimentos</h1>
          <p className="text-sm text-muted-foreground">
            Central de prazos: tarefas manuais, obrigações PF e obrigações dos imóveis, ordenadas por urgência.
          </p>
        </div>
        <Button variant="premium" onClick={() => { setForm(emptyTask); setOpen(true); }}><Plus className="h-4 w-4" /> Nova tarefa</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vencidos" value={counts.overdue} icon={AlertTriangle} tone="warn" />
        <StatCard label="Vencem hoje" value={counts.today} icon={Clock} tone="gold" />
        <StatCard label="Próximos 7 dias" value={counts.week} icon={CalendarDays} />
        <StatCard label="Próximos vencimentos" value={counts.upcoming} icon={CheckCircle2} tone="success" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, origem ou observação…" className="pl-9" />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <SelectTrigger><SelectValue placeholder="Filtro" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pendentes</SelectItem>
              <SelectItem value="overdue">Vencidos</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="next7">Próximos 7 dias</SelectItem>
              <SelectItem value="next30">Próximos 30 dias</SelectItem>
              <SelectItem value="pf">Obrigações PF</SelectItem>
              <SelectItem value="imoveis">Imóveis</SelectItem>
              <SelectItem value="manual">Tarefas manuais</SelectItem>
              <SelectItem value="done">Concluídos / pagos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fProperty} onValueChange={setFProperty}>
            <SelectTrigger><SelectValue placeholder="Imóvel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os imóveis</SelectItem>
              {(properties.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {deadlines.isLoading ? <LoadingState label="Carregando vencimentos…" /> :
       deadlines.isError ? (
        <ErrorState
          error={deadlines.error}
          onRetry={() => deadlines.refetch()}
          retrying={deadlines.isFetching}
          title="Não foi possível carregar os vencimentos"
        />
       ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <ListTodo className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">Nenhum item encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou crie uma nova tarefa.</p>
        </Card>
       ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <AgendaRow
              key={item.key}
              item={item}
              busy={busy}
              onEditTask={() => openEdit(item.raw)}
              onCompleteTask={() => { if (!busy) quickStatus.mutate({ id: item.recordId, status: "concluida" }); }}
              onRemoveTask={() => { if (!busy) remove.mutate(item.recordId); }}
              onPayObligation={() => { if (!busy) payObligation.mutate({ id: item.recordId, dueDate: item.dueDate }); }}
              onReopenObligation={() => { if (!busy) reopenObligation.mutate(item.recordId); }}
            />
          ))}
        </div>
       )}

      <TaskEditor
        open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyTask); }}
        form={form} setForm={setForm} onSave={() => { if (save.isPending) return; save.mutate(); }} saving={save.isPending}
        showProperty properties={properties.data ?? []}
      />
    </div>
  );
}

function AgendaRow({
  item, busy, onEditTask, onCompleteTask, onRemoveTask, onPayObligation, onReopenObligation,
}: {
  item: AgendaItem; busy?: boolean;
  onEditTask: () => void; onCompleteTask: () => void; onRemoveTask: () => void;
  onPayObligation: () => void; onReopenObligation: () => void;
}) {
  const style = URGENCY_STYLE[item.urgency];
  const isTask = item.source === "manual";
  const done = item.urgency === "concluido";
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border p-3 ${style.border}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{item.title}</span>
          <Badge className={`text-[10px] ${style.badge}`}>
            {style.dot && <span className="mr-1">{style.dot}</span>}
            {done ? (isTask ? taskStatusLabel[item.status] ?? "Concluída" : "Pago") : urgencyLabel(item)}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{item.sourceLabel}</Badge>
          {item.periodicity && (
            <Badge variant="outline" className="text-[10px]">{periodicityLabel[item.periodicity] ?? item.periodicity}</Badge>
          )}
          {item.rolled && <Badge variant="outline" className="text-[10px]">Próxima ocorrência</Badge>}
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {item.dueDate && (
            <span className={item.urgency === "vencido" ? "font-medium text-destructive" : ""}>
              <Clock className="inline h-3 w-3" /> Vencimento {dateBR(item.dueDate)}
            </span>
          )}
          {item.amount != null && <span>{currencyBRL(item.amount)}</span>}
          {item.raw?.assignee && <span>👤 {item.raw.assignee}</span>}
        </p>
        {item.notes && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.notes}</p>}
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1">
          {isTask ? (
            <>
              {!done && (
                <Button size="sm" variant="ghost" title="Concluir" disabled={busy} onClick={onCompleteTask}>
                  <Check className="h-4 w-4 text-success" />
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={onEditTask}><Pencil className="h-4 w-4" /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={busy} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
                    <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (!busy) onRemoveTask(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : done ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onReopenObligation}>Reabrir</Button>
          ) : (
            <Button size="sm" variant="ghost" title="Marcar como paga" disabled={busy} onClick={onPayObligation}>
              <Check className="h-4 w-4 text-success" />
            </Button>
          )}
        </div>
        {item.source === "pf" ? (
          <Link to="/app/personal-obligations" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
            Abrir origem <ExternalLink className="h-3 w-3" />
          </Link>
        ) : item.propertyId ? (
          <Link to="/app/properties/$id" params={{ id: item.propertyId }} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
            Abrir imóvel <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "primary" }: { label: string; value: number; icon: any; tone?: "primary" | "gold" | "success" | "warn" }) {
  const tones: Record<string, string> = {
    primary: "bg-[image:var(--gradient-primary)] text-primary-foreground",
    gold: "bg-[image:var(--gradient-gold)] text-accent-foreground",
    success: "bg-success text-success-foreground",
    warn: "bg-destructive text-destructive-foreground",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      </div>
    </Card>
  );
}
