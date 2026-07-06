import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABEL: Record<AppRole, string> = {
  proprietario: "Proprietário",
  administrador: "Administrador",
  contador: "Contador",
  colaborador: "Colaborador",
  visualizador: "Visualizador",
};

export type Permission =
  | "manageUsers"
  | "viewAudit"
  | "exportReports"
  | "approveReceipts"
  | "bulkActions"
  | "deleteData"
  | "manageEntities" // profiles, banks, cards, categories, properties
  | "uploadReceipts"
  | "editReceipts"
  | "viewAll";

const MATRIX: Record<AppRole, Permission[]> = {
  proprietario: [
    "manageUsers", "viewAudit", "exportReports", "approveReceipts",
    "bulkActions", "deleteData", "manageEntities", "uploadReceipts",
    "editReceipts", "viewAll",
  ],
  administrador: [
    "viewAudit", "exportReports", "approveReceipts", "bulkActions",
    "deleteData", "manageEntities", "uploadReceipts", "editReceipts", "viewAll",
  ],
  contador: ["viewAudit", "exportReports", "editReceipts", "viewAll"],
  colaborador: ["uploadReceipts", "editReceipts"],
  visualizador: ["viewAll"],
};

export function useRoles() {
  return useQuery({
    queryKey: ["my-roles"],
    staleTime: 60_000,
    queryFn: async (): Promise<AppRole[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return [];
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function hasPermission(roles: AppRole[] | undefined, perm: Permission): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => MATRIX[r]?.includes(perm));
}

export function useCan(perm: Permission): boolean {
  const { data } = useRoles();
  return hasPermission(data, perm);
}

export function highestRole(roles: AppRole[] | undefined): AppRole | null {
  const order: AppRole[] = ["proprietario", "administrador", "contador", "colaborador", "visualizador"];
  if (!roles) return null;
  for (const r of order) if (roles.includes(r)) return r;
  return null;
}