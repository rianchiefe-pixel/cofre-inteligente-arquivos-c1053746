import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, default_type')
    .eq('user_id', userId);

  console.log('Categories found for user:', categories?.length);

  // Filter relevant families based on report
  const relevantKeywords = [
    'Academia', 'APAE', 'Condomínio', 'Educação', 'Internet', 'Telefone', 
    'Pensão', 'Saúde', 'Seguro', 'Alimentação', 'Combustível', 'Diarista', 
    'Farmácia', 'Personal', 'Pediatria'
  ];

  const foundRelevant = categories?.filter(c => 
    relevantKeywords.some(kw => c.name.toLowerCase().includes(kw.toLowerCase()))
  );

  console.log('Relevant categories found:', foundRelevant);

  // Totals before (Jan-Apr 2026)
  const { data: receipts } = await supabase
    .from('receipts')
    .select('id, amount_centavos, transaction_type, date')
    .eq('profile_id', profileId)
    .gte('date', '2026-01-01')
    .lte('date', '2026-04-30');

  const totalFixos = receipts?.filter(r => r.transaction_type === 'gasto_fixo')
    .reduce((sum, r) => sum + r.amount_centavos, 0) || 0;
  
  const totalVariaveis = receipts?.filter(r => r.transaction_type === 'gasto_variavel')
    .reduce((sum, r) => sum + r.amount_centavos, 0) || 0;

  console.log('Total Fixos (Jan-Apr):', totalFixos / 100);
  console.log('Total Variáveis (Jan-Apr):', totalVariaveis / 100);
}

run();
