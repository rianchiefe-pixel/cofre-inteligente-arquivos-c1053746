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

    // Get cards strictly filtered by profile and user
    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("*, banks(name)")
      .eq("profile_id", targetProfileId)
      .eq("user_id", userId);

    if (cardsError) throw cardsError;
    if (!cards || cards.length === 0) return { cards: [] };

    const cardIds = cards.map(c => c.id);

    // Get holders
    const { data: holders, error: holdersError } = await supabase
      .from("card_holders")
      .select("*")
      .in("card_id", cardIds);

    if (holdersError) throw holdersError;

    // Get stats from receipts (the financial truth)
    const { data: receipts, error: recError } = await supabase
      .from("receipts")
      .select("card_id, amount, status")
      .eq("profile_id", targetProfileId)
      .in("card_id", cardIds);

    if (recError) throw recError;

    const statsMap = new Map<string, { total: number, count: number, pendingCount: number }>();
    
    receipts?.forEach(r => {
        if (!r.card_id) return;
        const s = statsMap.get(r.card_id) || { total: 0, count: 0, pendingCount: 0 };
        s.total += Number(r.amount || 0);
        s.count++;
        if (r.status === 'pending') s.pendingCount++;
        statsMap.set(r.card_id, s);
    });

    return {
      cards: cards.map(c => ({
        ...c,
        holders: (holders || []).filter(h => h.card_id === c.id),
        stats: statsMap.get(c.id) || { total: 0, count: 0, pendingCount: 0 }
      }))
    };
  });
