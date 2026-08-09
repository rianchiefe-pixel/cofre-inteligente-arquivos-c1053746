import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function auditCategories() {
  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, profile_id, parent_id, default_type, status, created_at')
    .order('name');

  if (error) {
    console.error("Error fetching categories:", error);
    process.exit(1);
  }

  const { data: receipts, error: receiptsError } = await supabase
    .from('receipts')
    .select('category_id, amount_cents');

  if (receiptsError) {
    console.error("Error fetching receipts:", receiptsError);
    process.exit(1);
  }

  const stats = (receipts || []).reduce((acc: any, r: any) => {
    if (r.category_id) {
      if (!acc[r.category_id]) acc[r.category_id] = { count: 0, total: 0 };
      acc[r.category_id].count++;
      acc[r.category_id].total += r.amount_cents || 0;
    }
    return acc;
  }, {});

  console.log(JSON.stringify(categories.map((c: any) => ({
    ...c,
    receipt_count: stats[c.id]?.count || 0,
    total_amount: stats[c.id]?.total || 0
  })), null, 2));
}

auditCategories();
