import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeCategoryName(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([/\-()])\s*/g, "$1")
    .replace(/[.,;]/g, "");
}

async function run() {
  const { data: categories } = await supabase.from('categories').select('*');
  const { data: receipts } = await supabase.from('receipts').select('id, category_id, amount');
  const { data: recipients } = await supabase.from('recipients').select('id, default_category_id');

  if (!categories) return;

  const receiptStats = (receipts || []).reduce((acc: any, r: any) => {
    if (r.category_id) {
      if (!acc[r.category_id]) acc[r.category_id] = { count: 0, total: 0 };
      acc[r.category_id].count++;
      acc[r.category_id].total += Math.round(Math.abs(Number(r.amount ?? 0)) * 100);
    }
    return acc;
  }, {});

  const groups: Record<string, any[]> = {};
  categories.forEach(cat => {
    const norm = normalizeCategoryName(cat.name);
    const key = `${cat.user_id}:${norm}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      ...cat,
      receipt_count: receiptStats[cat.id]?.count || 0,
      total_amount: receiptStats[cat.id]?.total || 0
    });
  });

  const duplicates = Object.entries(groups).filter(([_, items]) => items.length > 1);

  console.log("Integrity Audit Result:");
  console.log(JSON.stringify({
    total_categories: categories.length,
    duplicate_groups_count: duplicates.length,
    groups: duplicates.map(([norm, items]) => {
      const sorted = [...items].sort((a, b) => b.receipt_count - a.receipt_count || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return {
        normalized: norm,
        canonical: sorted[0].name,
        canonical_id: sorted[0].id,
        others: sorted.slice(1).map(o => ({ name: o.name, id: o.id, receipts: o.receipt_count }))
      };
    })
  }, null, 2));
}
run();
