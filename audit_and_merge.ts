import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

function normalizeCategoryName(name: string): string {
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
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, parent_id, default_type, archived, created_at, user_id');

  if (catError) {
    console.error("Error fetching categories:", catError);
    process.exit(1);
  }

  if (!categories || categories.length === 0) {
    console.log("No categories found in database.");
    return;
  }

  const { data: receipts, error: recError } = await supabase
    .from('receipts')
    .select('id, category_id, amount');

  if (recError) {
    console.error("Error fetching receipts:", recError);
    process.exit(1);
  }

  const receiptStats = (receipts || []).reduce((acc: any, r: any) => {
    if (r.category_id) {
      if (!acc[r.category_id]) acc[r.category_id] = { count: 0, total: 0 };
      acc[r.category_id].count++;
      acc[r.category_id].total += Math.round(Math.abs(Number(r.amount ?? 0)) * 100);
    }
    return acc;
  }, {});

  // Group by profile and normalized name
  const groups: Record<string, any[]> = {};
  for (const cat of categories) {
    const norm = normalizeCategoryName(cat.name);
    const key = `${cat.user_id}:${norm}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      ...cat,
      receipt_count: receiptStats[cat.id]?.count || 0,
      total_amount: receiptStats[cat.id]?.total || 0
    });
  }

  const duplicates = Object.entries(groups).filter(([_, items]) => items.length > 1);

  console.log(`Audit Summary:`);
  console.log(`Total Categories: ${categories.length}`);
  console.log(`Duplicate Groups (Normalized): ${duplicates.length}`);

  const mergePlan: any[] = [];

  for (const [key, items] of duplicates) {
    // Choose canonical: 1. Most receipts, 2. Most recent if no receipts, 3. Shortest name
    const sorted = [...items].sort((a, b) => {
      if (b.receipt_count !== a.receipt_count) return b.receipt_count - a.receipt_count;
      if (b.total_amount !== a.total_amount) return b.total_amount - a.total_amount;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const canonical = sorted[0];
    const others = sorted.slice(1);

    mergePlan.push({
      canonical,
      toMerge: others,
      reason: "Exact normalization match"
    });
  }

  console.log("\nMerge Plan:");
  console.log(JSON.stringify(mergePlan, null, 2));
}

run();
