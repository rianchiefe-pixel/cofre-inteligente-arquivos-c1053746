import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const recurringFixedExpenseSchema = z.object({
  profile_id: z.string().uuid(),
  property_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  name: z.string(),
  merchant_pattern: z.string().optional().nullable(),
  description_pattern: z.string().optional().nullable(),
  start_month: z.string(),
  active: z.boolean().default(true),
});

export const createRecurringFixedExpense = createServerFn({ method: "POST" })
  .inputValidator((data) => recurringFixedExpenseSchema.parse(data))
  .handler(async ({ data }) => {
    console.log("FIXED_ADD_START", { correlationId: Date.now(), data });
    
    const { data: { user } } = await supabase.auth.getUser();
    console.log("FIXED_ADD_SERVER_AUTH", { userId: user?.id });
    
    if (!user) {
        console.error("FIXED_ADD_AUTH_ERROR");
        throw new Error("Unauthorized");
    }

    // Verificar se já existe uma recorrência com esse nome para esse perfil
    const { data: existing } = await (supabase as any)
      .from("recurring_fixed_expenses")
      .select("id")
      .eq("profile_id", data.profile_id)
      .eq("name", data.name)
      .maybeSingle();

    if (existing) {
      console.log("FIXED_ADD_ALREADY_EXISTS", { id: existing.id });
      return { id: existing.id, already_exists: true };
    }

    console.log("FIXED_ADD_DB_ATTEMPT", { ...data, user_id: user.id });

    const { data: res, error } = await (supabase as any)
      .from("recurring_fixed_expenses")
      .insert([{ ...data, user_id: user.id }])
      .select()
      .single();

    if (error) {
        console.error("FIXED_ADD_DB_ERROR", { 
            code: error.code, 
            message: error.message, 
            details: error.details, 
            hint: error.hint 
        });
        throw new Error(`DB_ERROR: ${error.message} (Code: ${error.code})`);
    }
    
    console.log("FIXED_ADD_DB_SUCCESS", { id: res.id });
    return res;
  });

export const updateRecurringFixedExpense = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid(), updates: recurringFixedExpenseSchema.partial() }).parse(data))
  .handler(async ({ data }) => {
    const { data: res, error } = await (supabase as any)
      .from("recurring_fixed_expenses")
      .update(data.updates)
      .eq("id", data.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res;
  });

export const deleteRecurringFixedExpense = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { error } = await (supabase as any)
      .from("recurring_fixed_expenses")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return true;
  });

export const setRecurringExpenseMatch = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    recurring_fixed_expense_id: z.string().uuid(),
    month: z.string(), // YYYY-MM-DD
    receipt_id: z.string().uuid().optional().nullable(),
    status: z.enum(['encontrado', 'nao_encontrado', 'revisar', 'nao_se_aplica']),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: res, error } = await (supabase as any)
      .from("recurring_expense_matches")
      .upsert([{ ...data, user_id: user.id }], { onConflict: 'recurring_fixed_expense_id,month' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res;
  });

export const findRecurringFixedExpenseMatch = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    profile_id: z.string().uuid(),
    expense: z.any(),
    month: z.number().min(1).max(12),
    year: z.number(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { profile_id, expense, month, year } = data;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const { data: existingMatch } = await (supabase as any)
      .from("recurring_expense_matches")
      .select("*, receipts(*)")
      .eq("recurring_fixed_expense_id", expense.id)
      .eq("month", startDate)
      .maybeSingle();

    if (existingMatch && existingMatch.status !== 'nao_encontrado') {
      return { match: existingMatch.receipts, status: existingMatch.status, matchId: existingMatch.id };
    }

    let query = (supabase as any)
      .from("receipts")
      .select("*")
      .eq("profile_id", profile_id)
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .eq("status", "approved");

    if (expense.property_id) query = query.eq("property_id", expense.property_id);
    if (expense.category_id) query = query.eq("category_id", expense.category_id);

    const { data: candidates } = await query;

    if (!candidates || candidates.length === 0) {
      return { match: null, status: 'nao_encontrado' };
    }

    const matches = candidates.filter((c: any) => {
      const name = (c.recipient_name || "").toLowerCase();
      const desc = (c.description || "").toLowerCase();
      const mPattern = (expense.merchant_pattern || "").toLowerCase();
      const dPattern = (expense.description_pattern || "").toLowerCase();
      
      const mMatch = mPattern && name.includes(mPattern);
      const dMatch = dPattern && desc.includes(dPattern);
      
      return mMatch || dMatch;
    });

    if (matches.length === 1) {
      return { match: matches[0], status: 'encontrado' };
    } else if (matches.length > 1) {
      return { match: matches[0], status: 'revisar', ambiguity: true };
    }

    if (candidates.length === 1 && !expense.merchant_pattern && !expense.description_pattern) {
        return { match: candidates[0], status: 'encontrado' };
    }

    return { match: null, status: 'nao_encontrado' };
  });
