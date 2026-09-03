import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { obligationKindLabel } from "@/lib/format";
import {
  agendaItemsFromObligation,
  agendaFromTask,
  sortAgenda,
  todayLocalISO,
  type AgendaItem,
} from "@/lib/deadlines";

const sb = supabase as any;

export function obligationTitle(o: any) {
  return o.label || obligationKindLabel[o.kind] || o.kind || "Obrigação";
}

/** Tarefas manuais + obrigações PF + obrigações de imóveis, unificadas e ordenadas. */
export function useDeadlines() {
  const tasks = useQuery({
    queryKey: ["tasks-all"],
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await sb
        .from("property_tasks")
        .select("*, properties(id,name)")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const obligations = useQuery({
    queryKey: ["obligations-all"],
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await sb
        .from("property_obligations")
        .select("*, properties(id,name)")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const items = useMemo<AgendaItem[]>(() => {
    const today = todayLocalISO();
    const list: AgendaItem[] = [];
    for (const t of tasks.data ?? []) list.push(agendaFromTask(t, today));
    for (const o of obligations.data ?? [])
      list.push(...agendaItemsFromObligation(o, obligationTitle, o.properties?.name ?? null, today));
    // Deduplicação defensiva: uma ocorrência por registro/ciclo.
    const seen = new Set<string>();
    const unique = list.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
    return sortAgenda(unique);
  }, [tasks.data, obligations.data]);

  const counts = useMemo(() => {
    const overdue = items.filter((i) => i.urgency === "vencido").length;
    const today = items.filter((i) => i.urgency === "hoje").length;
    const week = items.filter((i) => i.urgency === "urgente" || i.urgency === "atencao").length;
    const upcoming = items.filter((i) => i.urgency === "normal" && i.dueDate).length;
    return { overdue, today, week, upcoming, alert: overdue + today + week };
  }, [items]);

  return {
    items,
    counts,
    isLoading: tasks.isLoading || obligations.isLoading,
    isError: tasks.isError || obligations.isError,
    error: tasks.error ?? obligations.error,
    isFetching: tasks.isFetching || obligations.isFetching,
    refetch: () => {
      tasks.refetch();
      obligations.refetch();
    },
  };
}
