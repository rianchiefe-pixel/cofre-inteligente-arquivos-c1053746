import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data: recs } = await supabase.from('receipts').select('category_id, amount').eq('status', 'approved');
  const { data: cats } = await supabase.from('categories').select('id, name');
  const catMap = new Map(cats?.map(c => [c.id, c.name]));

  const stats: any = {};
  recs?.forEach(r => {
    const name = catMap.get(r.category_id!) || 'Sem categoria';
    if (!stats[name]) stats[name] = { count: 0, total: 0 };
    stats[name].count++;
    stats[name].total += Math.round(Math.abs(Number(r.amount ?? 0)) * 100);
  });

  console.log("Status das categorias críticas em Janeiro-Julho:");
  ['Diarista', 'DIARISTA', 'salão leila', 'salão Leila', 'Cartório/Registro', 'Cartório / registro'].forEach(n => {
    if (stats[n]) console.log(`${n}: ${stats[n].count} lançamentos, Total R$ ${(stats[n].total/100).toFixed(2)}`);
  });
}
run();
