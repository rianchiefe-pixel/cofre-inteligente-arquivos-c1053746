import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MERGE_PLAN = [
  { canonical_id: "9a8bd650-2b95-4798-97b5-9d96d081f308", others: ["80d51eb2-fe3f-4279-a0a4-e91c23f01f53"] }, // Diarista
  { canonical_id: "6b3d701a-dd2c-42ae-bcf7-d35c51b964d7", others: ["fa83ddce-4827-4243-8641-4e637c740820"] }, // salão leila
  { canonical_id: "d39eaab4-9659-467f-a26a-0d5dd99d7e93", others: ["00b0f549-42ac-427e-95cb-2e5e02bad9ca", "4ce13420-9574-4710-9c6f-2d80461bef07"] }, // Cartório
  { canonical_id: "b43783cc-21b6-4f52-b766-699eb4307f40", others: ["85cd6b56-d655-4419-b44b-74740d5d0c6e"] }, // Presentes
  { canonical_id: "42077083-3061-40a9-8b72-b88678ffb653", others: ["fd45f997-9b75-437b-a800-873db5c667e5"] }, // Farmácia
  { canonical_id: "86d2585d-16c5-4fe7-8165-ea926d4e6418", others: ["e2a97da8-483c-47f5-8607-adce219b60e5"] }, // Saúde
  { canonical_id: "7112320f-0a1d-444a-a3e0-1f5d8e834ec6", others: ["653523fc-89a3-4c87-9aee-a8cfc2b2f956"] }, // Combustível
  { canonical_id: "e571f049-5e1b-44e8-8f0c-8e4a85006a63", others: ["20b77991-7551-4e51-abc2-81fc141b5fb6"] }, // Condomínio
  { canonical_id: "d2425dfd-f484-40f3-baea-90f56c04fe70", others: ["1c0a364e-19d1-491c-b8f9-8ccd6e41d92c"] }, // Água
  { canonical_id: "033acbc4-ef0d-4619-af69-c8e275dad7b8", others: ["c69f2cab-0b92-47b9-bfa4-ada689838ca1"] }, // Empréstimo
  { canonical_id: "8e326cfa-9507-4591-9531-f065770c3623", others: ["4e453541-98a0-4bc5-bc62-2cee0b871101"] } // Alimentação
];

async function run() {
  console.log("Iniciando Migração de Categorias...");
  let totalMigrated = 0;

  for (const group of MERGE_PLAN) {
    const { canonical_id, others } = group;
    
    // 1. Update receipts
    const { count: rCount, error: rErr } = await supabase
      .from('receipts')
      .update({ category_id: canonical_id })
      .in('category_id', others);
    
    if (rErr) console.error(`Erro receipts (${canonical_id}):`, rErr.message);

    // 2. Update ai suggestions
    const { error: aiErr } = await supabase
      .from('receipts')
      .update({ ai_suggested_category_id: canonical_id })
      .in('ai_suggested_category_id', others);
    
    // 3. Update recipients
    const { error: repErr } = await supabase
      .from('recipients')
      .update({ default_category_id: canonical_id })
      .in('default_category_id', others);

    // 4. Archive old categories
    const { error: catErr } = await supabase
      .from('categories')
      .update({ archived: true, name: `[MERGED] ${new Date().toISOString()} - ` })
      .in('id', others);
    
    if (catErr) console.error(`Erro categories (${canonical_id}):`, catErr.message);
    
    console.log(`Grupo ${canonical_id}: Migrados ${rCount || 0} lançamentos.`);
    totalMigrated += (rCount || 0);
  }

  console.log(`Migração concluída. Total de lançamentos realocados: ${totalMigrated}`);
}
run();
