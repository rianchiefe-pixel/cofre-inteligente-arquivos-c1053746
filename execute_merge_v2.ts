import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MERGE_PLAN = [
  { canonical_id: "fa83ddce-4827-4243-8641-4e637c740820", others: ["6b3d701a-dd2c-42ae-bcf7-d35c51b964d7"] }, // salão Leila (canon) <- salão leila
  { canonical_id: "00b0f549-42ac-427e-95cb-2e5e02bad9ca", others: ["d39eaab4-9659-467f-a26a-0d5dd99d7e93", "4ce13420-9574-4710-9c6f-2d80461bef07"] }, // Cartório / registro (canon) <- outros
  { canonical_id: "9a8bd650-2b95-4798-97b5-9d96d081f308", others: ["80d51eb2-fe3f-4279-a0a4-e91c23f01f53"] },
];

async function run() {
  console.log("Iniciando Migração de Categorias V2...");
  
  // Lista as tabelas para garantir nomes corretos
  for (const group of MERGE_PLAN) {
    const { canonical_id, others } = group;
    
    // Tentamos fazer update SEM WHERE profile_id pois as categorias podem ter user_id compartilhado
    const { data: updated, error: rErr } = await supabase
      .from('receipts')
      .update({ category_id: canonical_id })
      .in('category_id', others)
      .select('id');
    
    if (rErr) console.error(`Erro receipts (${canonical_id}):`, rErr.message);
    else console.log(`Grupo ${canonical_id}: Migrados ${updated?.length || 0} lançamentos.`);

    await supabase.from('recipients').update({ default_category_id: canonical_id }).in('default_category_id', others);
    await supabase.from('categories').update({ archived: true }).in('id', others);
  }
}
run();
