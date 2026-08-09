import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getCardsStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ 
    profileId: z.string().optional()
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Response('Unauthorized', { status: 401 });
    
    const targetProfileId = input.profileId;
    if (!targetProfileId) return { cards: [] };

    // Get cards
    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("*, banks(name)")
      .eq("profile_id", targetProfileId)
      .eq("user_id", userId);

    if (cardsError) throw cardsError;

    // Get holders
    const { data: holders, error: holdersError } = await supabase
      .from("card_holders")
      .select("*")
      .in("card_id", (cards || []).map(c => c.id));

    if (holdersError) throw holdersError;

    // Get stats from receipts
    const { data: receipts, error: recError } = await supabase
      .from("receipts")
      .select("card_id, amount, status")
      .eq("profile_id", targetProfileId)
      .not("card_id", "is", null);

    if (recError) throw recError;

    // Get card_transactions counts
    const { data: cardTransactions, error: ctError } = await supabase
      .from("card_transactions")
      .select("card_id, status")
      .in("card_id", (cards || []).map(c => c.id));

    if (ctError) throw ctError;

    const statsMap = new Map<string, { total: number, count: number, pendingCount: number }>();
    
    // Sum from both receipts and card_transactions if necessary, 
    // but typically card_transactions is the source of truth for "cards" page history
    receipts?.forEach(r => {
        const s = statsMap.get(r.card_id!) || { total: 0, count: 0, pendingCount: 0 };
        s.total += Number(r.amount || 0);
        s.count++;
        if (r.status === 'pending') s.pendingCount++;
        statsMap.set(r.card_id!, s);
    });

    // Also count pending from card_transactions if they haven't been reconciled to receipts yet
    cardTransactions?.forEach(ct => {
        if (ct.status === 'pending') {
            const s = statsMap.get(ct.card_id!) || { total: 0, count: 0, pendingCount: 0 };
            s.pendingCount++;
            statsMap.set(ct.card_id!, s);
        }
    });

    return {
      cards: (cards || []).map(c => ({
        ...c,
        holders: (holders || []).filter(h => h.card_id === c.id),
        stats: statsMap.get(c.id) || { total: 0, count: 0, pendingCount: 0 }
      }))
    };
  });

