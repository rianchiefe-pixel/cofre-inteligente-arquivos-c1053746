import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PROFILE_ID = 'c44c244d-b05f-47dc-bc58-7056351e7703';
const START_DATE = '2026-01-01';
const END_DATE = '2026-04-30';

const OFFICIAL_REPORT = {
  total: { fixed: 8673748, variable: 11520598 }
};

async function run() {
  // Pegar nomes das colunas da tabela receipts para não errar mais
  const { data: cols } = await supabase.rpc('get_table_columns', { table_name: 'receipts' });
  // Se RPC não existir, vamos tentar campos comuns: created_at, updated_at, date_at...
  // Mas o erro anterior disse que 'date' e 'transaction_date' não existem.
  
  // Vamos buscar um registro qualquer para ver a estrutura
  const { data: sample } = await supabase.from('receipts').select('*').limit(1);
  console.log('Sample keys:', Object.keys(sample?.[0] || {}));

  const dateCol = sample?.[0]?.date ? 'date' : (sample?.[0]?.transaction_date ? 'transaction_date' : 'created_at');
  // Se o sample não tem data, vamos ver...
}
run();
