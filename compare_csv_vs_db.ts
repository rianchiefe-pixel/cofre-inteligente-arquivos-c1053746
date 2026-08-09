import { supabaseAdmin } from './src/integrations/supabase/client.server';
import * as fs from 'fs';

async function main() {
  const content = fs.readFileSync("/mnt/user-uploads/meu-cofre-maio-junho-2026-categorias-padronizadas.csv", 'utf-8');
  const csvArbos = content.split('\n').filter(l => l.includes("ARBOS") && l.includes("3.996,00"));
  console.log("ARBOS no CSV:");
  console.log(csvArbos);

  const { data: dbArbos } = await supabaseAdmin
    .from('receipts')
    .select('recipient_name, amount, payment_date, auth_code')
    .eq('amount', 3996)
    .ilike('recipient_name', '%ARBOS%');
  
  console.log("\nARBOS no DB (R$ 39,96 ou similar?):");
  console.log(JSON.stringify(dbArbos, null, 2));

  const { data: dbArbosCents } = await supabaseAdmin
    .from('receipts')
    .select('recipient_name, amount, payment_date, auth_code')
    .eq('amount', 399600);
  
  console.log("\nARBOS no DB (R$ 3.996,00):");
  console.log(JSON.stringify(dbArbosCents, null, 2));
}

main();
