import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const REMAINING_MERGE = [
  { canonical_id: "42077083-3061-40a9-8b72-b88678ffb653", others: ["fd45f997-9b75-437b-a800-873db5c667e5"] }, // Farmácia
  { canonical_id: "86d2585d-16c5-4fe7-8165-ea926d4e6418", others: ["e2a97da8-483c-47f5-8607-adce219b60e5"] }, // Saúde
  { canonical_id: "7112320f-0a1d-444a-a3e0-1f5d8e834ec6", others: ["653523fc-89a3-4c87-9aee-a8cfc2b2f956"] }, // Combustível
  { canonical_id: "e571f049-5e1b-44e8-8f0c-8e4a85006a63", others: ["20b77991-7551-4e51-abc2-81fc141b5fb6"] }, // Condomínio
  { canonical_id: "d2425dfd-f484-40f3-baea-90f56c04fe70", others: ["1c0a364e-19d1-491c-b8f9-8ccd6e41d92c"] }, // Água
  { canonical_id: "8e326cfa-9507-4591-9531-f065770c3623", others: ["4e453541-98a0-4bc5-bc62-2cee0b871101"] }, // Alimentação
  { canonical_id: "b43783cc-21b6-4f52-b766-699eb4307f40", others: ["85cd6b56-d655-4419-b44b-74740d5d0c6e"] }, // Presentes
  { canonical_id: "9a8bd650-2b95-4798-97b5-9d96d081f308", others: ["80d51eb2-fe3f-4279-a0a4-e91c23f01f53"] }, // Diarista
];

async function run() {
  for (const group of REMAINING_MERGE) {
     const { canonical_id, others } = group;
     await supabase.from('receipts').update({ category_id: canonical_id }).in('category_id', others);
     await supabase.from('recipients').update({ default_category_id: canonical_id }).in('default_category_id', others);
     await supabase.from('categories').update({ archived: true }).in('id', others);
  }
}
run();
