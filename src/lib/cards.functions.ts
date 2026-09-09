import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function monthLabel(iso: string) {
  const [year, month] = iso.split("-");
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${labels[(Number(month) || 1) - 1]}/${year}`;
}

function addMonths(date: Date, months: number) {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return d;
}

function isoMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export const getCardsStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ 
    profileId: z.string().optional()
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Response('Unauthorized', { status: 401 });
    
    const targetProfileId = input.profileId;
    if (!targetProfileId) return { cards: [], monthlyUsage: [] };

    // Get cards strictly filtered by profile and user
    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("*, banks(name)")
      .eq("profile_id", targetProfileId)
      .eq("user_id", userId);

    if (cardsError) throw cardsError;
    if (!cards || cards.length === 0) return { cards: [], monthlyUsage: [] };

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
      .select("card_id, amount, status, payment_date")
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

    // Build last 12 months usage buckets
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      months.push(isoMonth(addMonths(now, -i)));
    }

    const monthlyMap = new Map<string, { total: number; byCard: Map<string, number> }>();
    months.forEach(m => monthlyMap.set(m, { total: 0, byCard: new Map() }));

    receipts?.forEach(r => {
      if (!r.card_id || !r.payment_date) return;
      const m = r.payment_date.slice(0, 7);
      const bucket = monthlyMap.get(m);
      if (!bucket) return;
      const amount = Number(r.amount || 0);
      bucket.total += amount;
      bucket.byCard.set(r.card_id, (bucket.byCard.get(r.card_id) || 0) + amount);
    });

    const cardNameMap = new Map(cards.map(c => [c.id, c.name]));

    const monthlyUsage = months.map(m => {
      const bucket = monthlyMap.get(m)!;
      return {
        month: m,
        label: monthLabel(m),
        total: bucket.total,
        cards: Array.from(bucket.byCard.entries())
          .map(([id, total]) => ({ id, name: cardNameMap.get(id) || "Cartão", total }))
          .sort((a, b) => b.total - a.total),
      };
    });

    return {
      cards: cards.map(c => ({
        ...c,
        holders: (holders || []).filter(h => h.card_id === c.id),
        stats: statsMap.get(c.id) || { total: 0, count: 0, pendingCount: 0 }
      })),
      monthlyUsage,
    };
  });
