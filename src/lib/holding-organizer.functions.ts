// Organização dos lançamentos da Advocacia Liliane Pereira dentro do perfil Holding.
// Cada função opera exclusivamente sobre o profileId real recebido; a RPC recusa
// qualquer lançamento que não pertença a esse perfil e nunca altera o perfil.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildOrganizerPlan,
  ensureAdvocaciaTaxonomy,
  loadOrganizerContext,
  resolveOrganizerItems,
  type OrganizerPlan,
} from "./holding-organizer.server";

export const getHoldingAdvocaciaPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string }) => {
    if (!input?.profileId) throw new Error("Informe o perfil Holding");
    return input;
  })
  .handler(async ({ data, context }): Promise<OrganizerPlan> => {
    const ctx = await loadOrganizerContext(context.supabase, context.userId, data.profileId);
    return buildOrganizerPlan(ctx);
  });

export const applyHoldingAdvocaciaPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string; receiptIds: string[]; override?: boolean }) => {
    if (!input?.profileId) throw new Error("Informe o perfil Holding");
    if (!Array.isArray(input.receiptIds) || input.receiptIds.length === 0) {
      throw new Error("Selecione ao menos um lançamento");
    }
    return { profileId: input.profileId, receiptIds: input.receiptIds, override: input.override === true };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await loadOrganizerContext(supabase, userId, data.profileId);
    const taxonomy = await ensureAdvocaciaTaxonomy(supabase, userId, data.profileId, ctx);
    const resolved = await resolveOrganizerItems(supabase, userId, data.profileId, ctx, taxonomy, data.receiptIds, data.override);

    const runId = crypto.randomUUID();
    const { data: result, error } = await supabase.rpc("apply_holding_organization_rpc", {
      p_profile_id: data.profileId,
      p_run_id: runId,
      p_items: resolved.items,
    });
    if (error) throw new Error(error.message);

    const rows = result ?? [];
    return {
      runId,
      applied: rows.filter((r) => r.applied).length,
      skipped: rows.filter((r) => !r.applied).map((r) => ({ receiptId: r.receipt_id, reason: r.reason })),
      categoriesCreated: taxonomy.created,
      costCenterId: taxonomy.costCenterId,
      costCenterCreated: taxonomy.costCenterCreated,
      propertiesCreated: resolved.propertiesCreated,
      propertiesReused: resolved.propertiesReused,
    };
  });

export const undoHoldingAdvocaciaPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => {
    if (!input?.runId) throw new Error("Informe a execução a desfazer");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("undo_holding_organization_rpc", {
      p_run_id: data.runId,
    });
    if (error) throw new Error(error.message);
    return { reverted: result?.[0]?.reverted ?? 0 };
  });