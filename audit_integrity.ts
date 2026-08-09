import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
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
  // Pegamos o usuário para isolar perfis se necessário, mas auditamos tudo o que a chave permite
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, parent_id, default_type, archived, created_at, user_id');

  if (catError) {
    console.error("Erro categorias:", catError.message);
    return;
  }

  const { data: receipts, error: recError } = await supabase
    .from('receipts')
    .select('id, category_id, amount, payment_date');

  if (recError) {
    console.error("Erro lançamentos:", recError.message);
    return;
  }

  const receiptStats = (receipts || []).reduce((acc: any, r: any) => {
    if (r.category_id) {
      if (!acc[r.category_id]) acc[r.category_id] = { count: 0, total: 0 };
      acc[r.category_id].count++;
      acc[r.category_id].total += Math.round(Math.abs(Number(r.amount ?? 0)) * 100);
    }
    return acc;
  }, {});

  const groups: Record<string, any[]> = {};
  categories?.forEach(cat => {
    const norm = normalizeCategoryName(cat.name);
    // Agrupamos por NOME NORMALIZADO. Se o requisito permitir merge entre perfis 
    // (o que é perigoso), o prefixo user_id bastaria. Se for por perfil, profile_id.
    // Como categories não tem profile_id no schema visto, usamos user_id.
    const key = `${cat.user_id}:${norm}`; 
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      ...cat,
      receipt_count: receiptStats[cat.id]?.count || 0,
      total_amount: receiptStats[cat.id]?.total || 0
    });
  });

  const duplicates = Object.entries(groups).filter(([_, items]) => items.length > 1);

  console.log(JSON.stringify({
    total_categories: categories?.length,
    duplicate_groups: duplicates.length,
    details: duplicates.map(([key, items]) => ({
      key,
      items: items.sort((a, b) => b.receipt_count - a.receipt_count || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }))
  }, null, 2));
}
run();
