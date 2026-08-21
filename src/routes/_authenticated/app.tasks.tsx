import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { taskPriorityLabel, taskStatusLabel } from "@/lib/format";
import { ListTodo, Plus, Search, AlertTriangle, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { TaskEditor, TaskRow, daysUntil, emptyTask, type TaskForm } from "@/components/property-tabs";
import { LoadingState, ErrorState } from "@/components/query-states";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/app/tasks")({
  head: () => ({ meta: [{ title: "Tarefas — Meu Cofre" }] }),
  component: TasksPage,
});

function TasksPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? "")); }, []);

  const [q, setQ] = useState("");
  const [fProperty, setFProperty] = useState("all");
  const [fStatus, setFStatus] = useState("open"); // open = not concluida/cancelada
  const [fPriority, setFPriority] = useState("all");
  const [fDate, setFDate] = useState("all"); // all|overdue|today|week|none
  const [fAssignee, setFAssignee] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TaskForm>(emptyTask);

  const properties = useQuery({
    queryKey: ["properties-min"],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });


  const list = useQuery({
    queryKey: ["tasks-all"],
    queryFn: async () => {
      const { data, error } = await sb.from("property_tasks").select("*, properties(id,name)").order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

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
    onSuccess: () => { toast.success("Tarefa salva"); setOpen(false); setForm(emptyTask); qc.invalidateQueries({ queryKey: ["tasks-all"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const quickStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      // Alternar rapidamente entre status precisa limpar a data de conclusão.
      patch.completed_at = status === "concluida" ? new Date().toISOString() : null;
      // Confirma a linha efetivamente atualizada: sem isso, um bloqueio de RLS
      // retorna sucesso vazio e a interface mentiria para o usuário.
      const { data, error } = await sb.from("property_tasks").update(patch).eq("id", id).select("id, status");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("Nenhuma tarefa foi atualizada.");
      return data[0];
    },
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["tasks-all"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar o status"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from("property_tasks").delete().eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("A exclusão não foi confirmada pelo banco de dados.");
    },
    onSuccess: () => { toast.success("Tarefa excluída"); qc.invalidateQueries({ queryKey: ["tasks-all"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível excluir a tarefa"),
  });

  // Trava única contra duplo clique e ações concorrentes na lista.
  const busy = save.isPending || quickStatus.isPending || remove.isPending;

  const openEdit = (t: any) => {
    setForm({
      id: t.id, title: t.title, description: t.description ?? "", due_date: t.due_date ?? "",
      assignee: t.assignee ?? "", priority: t.priority, status: t.status, notes: t.notes ?? "",
      property_id: t.property_id ?? null,
    });
    setOpen(true);
  };

  const assignees = useMemo(() => {
    const s = new Set<string>();
    (list.data ?? []).forEach((t) => t.assignee && s.add(t.assignee));
    return Array.from(s).sort();
  }, [list.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((t) => {
      if (fProperty !== "all" && t.property_id !== fProperty) return false;
      if (fPriority !== "all" && t.priority !== fPriority) return false;
      if (fAssignee !== "all" && t.assignee !== fAssignee) return false;
      if (fStatus === "open" && ["concluida", "cancelada"].includes(t.status)) return false;
      else if (fStatus !== "all" && fStatus !== "open" && t.status !== fStatus) return false;
      const d = daysUntil(t.due_date);
      if (fDate === "overdue" && !(d != null && d < 0)) return false;
      if (fDate === "today" && d !== 0) return false;
      if (fDate === "week" && !(d != null && d >= 0 && d <= 7)) return false;
      if (fDate === "none" && t.due_date) return false;
      if (term && ![t.title, t.description, t.assignee, t.notes, t.properties?.name].some((v: any) => String(v ?? "").toLowerCase().includes(term))) return false;
      return true;
    });
  }, [list.data, q, fProperty, fStatus, fPriority, fDate, fAssignee]);

  const stats = useMemo(() => {
    const all = list.data ?? [];
    const open = all.filter((t) => !["concluida", "cancelada"].includes(t.status));
    const overdue = open.filter((t) => { const d = daysUntil(t.due_date); return d != null && d < 0; });
    const today = open.filter((t) => daysUntil(t.due_date) === 0);
    const done = all.filter((t) => t.status === "concluida");
    return { pending: open.length, overdue: overdue.length, today: today.length, done: done.length };
  }, [list.data]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Tarefas</h1>
          <p className="text-sm text-muted-foreground">Todas as pendências de todos os imóveis em um só lugar.</p>
        </div>
        <Button variant="premium" onClick={() => { setForm(emptyTask); setOpen(true); }}><Plus className="h-4 w-4" /> Nova tarefa</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pendentes" value={stats.pending} icon={ListTodo} />
        <StatCard label="Atrasadas" value={stats.overdue} icon={AlertTriangle} tone="warn" />
        <StatCard label="Para hoje" value={stats.today} icon={Clock} tone="gold" />
        <StatCard label="Concluídas" value={stats.done} icon={CheckCircle2} tone="success" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarefa…" className="pl-9" />
          </div>
          <Select value={fProperty} onValueChange={setFProperty}>
            <SelectTrigger><SelectValue placeholder="Imóvel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os imóveis</SelectItem>
              {(properties.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Abertas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(taskStatusLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPriority} onValueChange={setFPriority}>
            <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              {Object.entries(taskPriorityLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fDate} onValueChange={setFDate}>
            <SelectTrigger><SelectValue placeholder="Prazo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer prazo</SelectItem>
              <SelectItem value="overdue">Atrasadas</SelectItem>
              <SelectItem value="today">Vencendo hoje</SelectItem>
              <SelectItem value="week">Vencendo nesta semana</SelectItem>
              <SelectItem value="none">Sem prazo</SelectItem>
            </SelectContent>
          </Select>
          {assignees.length > 0 && (
            <Select value={fAssignee} onValueChange={setFAssignee}>
              <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {assignees.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </Card>

      {list.isLoading ? <LoadingState label="Carregando tarefas…" /> :
       list.isError ? (
        <ErrorState
          error={list.error}
          onRetry={() => list.refetch()}
          retrying={list.isFetching}
          title="Não foi possível carregar as tarefas"
        />
       ) : (list.data ?? []).length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <ListTodo className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">Nenhuma tarefa cadastrada</p>
          <p className="mt-1 text-xs text-muted-foreground">Crie a primeira tarefa para acompanhar prazos e responsáveis.</p>
        </Card>
       ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <ListTodo className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">Nenhuma tarefa encontrada</p>
          <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou crie uma nova tarefa.</p>
        </Card>
       ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.id} className="group relative">
              <TaskRow
                t={t}
                showProperty
                onEdit={() => openEdit(t)}
                busy={busy}
                onQuickStatus={(s) => { if (busy) return; quickStatus.mutate({ id: t.id, status: s }); }}
                onRemove={() => { if (busy) return; remove.mutate(t.id); }}
              />
              {t.property_id && (
                <Link
                  to="/app/properties/$id"
                  params={{ id: t.property_id }}
                  className="absolute right-3 bottom-3 text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                >
                  Abrir imóvel <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
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