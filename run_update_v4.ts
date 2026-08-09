import { supabaseAdmin } from './src/integrations/supabase/client.server';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

const USER_ID = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
const CSV_PATH = '/tmp/meu-cofre-categorias-corrigidas-ate-30-04-2026.csv';

function parseDate(dateStr: string) {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function parseAmount(amountStr: string): number {
  if (!amountStr) return 0;
  // Limpeza robusta: R$ 1.880,00 -> 1880
  const clean = amountStr.replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
  const val = parseFloat(clean);
  // No banco, 800 reais = 800, 3996 reais = 3996. Não centavos!
  return val;
}

async function run() {
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const allRecords = parse(csvContent, { columns: true, skip_empty_lines: true });

  const records = allRecords.filter(r => {
    const d = parseDate(r.Data);
    return d && d.getFullYear() === 2026 && d.getMonth() <= 3; // Jan-Abr 2026
  });

  console.log(`Processando ${records.length} registros (Jan-Abr 2026).`);

  const { data: profiles } = await supabaseAdmin.from('financial_profiles').select('id, name').eq('user_id', USER_ID);
  const profileMap = new Map();
  profiles?.forEach(p => profileMap.set(p.name, p.id));

  const { data: allCategories } = await supabaseAdmin.from('categories').select('id, name, profile_id');
  const categoryMapByProfile = new Map();
  allCategories?.forEach(c => {
    if (!categoryMapByProfile.has(c.profile_id)) categoryMapByProfile.set(c.profile_id, new Map());
    categoryMapByProfile.get(c.profile_id).set(c.name.trim().toLowerCase(), c.id);
  });

  async function getOrCreateCategory(name: string, profileId: string) {
    const normalized = name.trim().toLowerCase();
    const pCats = categoryMapByProfile.get(profileId);
    if (pCats && pCats.has(normalized)) return pCats.get(normalized);

    console.log(`Criando categoria "${name}" para perfil ${profileId}`);
    const { data: newCat, error } = await supabaseAdmin.from('categories').insert({ name, profile_id: profileId, user_id: USER_ID }).select('id').single();
    if (error) {
      console.error(`Erro ao criar categoria ${name}:`, error);
      return null;
    }
    if (!categoryMapByProfile.has(profileId)) categoryMapByProfile.set(profileId, new Map());
    categoryMapByProfile.get(profileId).set(normalized, newCat.id);
    return newCat.id;
  }

  const { data: dbReceipts } = await supabaseAdmin
    .from('receipts')
    .select('id, category_id, payment_date, amount, recipient_name, auth_code, profile_id')
    .eq('user_id', USER_ID)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-04-30');

  console.log(`Lançamentos Jan-Abr no banco: ${dbReceipts?.length || 0}`);

  let stats = { found: 0, updated: 0, alreadyCorrect: 0, notFound: 0, ambiguous: 0 };
  const auditLogs = [];

  for (const record of records) {
    const date = parseDate(record.Data);
    const amount = parseAmount(record.Valor);
    const recipient = record.Destinatário.trim().toLowerCase();
    const targetCategoryName = record.Categoria.trim();
    const profileId = profileMap.get(record.Perfil.trim());
    const authCode = record.Autenticação?.trim();

    if (!profileId) continue;

    const matches = dbReceipts?.filter(db => {
      if (db.profile_id !== profileId) return false;
      // Comparação de valor exato
      if (Math.abs(db.amount! - amount) > 0.01) return false;
      
      // Se tiver auth_code no CSV e no banco, deve bater
      if (authCode && db.auth_code === authCode) return true;
      
      // Senão, checa proximidade de data e nome
      const dbDate = new Date(db.payment_date!);
      const diffDays = Math.abs((dbDate.getTime() - date!.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 2) return false;

      // Nome do destinatário
      const dbName = db.recipient_name?.toLowerCase() || '';
      return dbName.includes(recipient.substring(0, 5)) || recipient.includes(dbName.substring(0, 5));
    });

    if (!matches || matches.length === 0) {
      stats.notFound++;
      continue;
    }

    if (matches.length > 1) {
      stats.ambiguous++;
      continue;
    }

    const dbRecord = matches[0];
    stats.found++;

    const targetCategoryId = await getOrCreateCategory(targetCategoryName, profileId);
    if (dbRecord.category_id === targetCategoryId) {
      stats.alreadyCorrect++;
    } else {
      const { data: curCat } = await supabaseAdmin.from('categories').select('name').eq('id', dbRecord.category_id).single();
      const { error: upError } = await supabaseAdmin
        .from('receipts')
        .update({ category_id: targetCategoryId, updated_at: new Date().toISOString() })
        .eq('id', dbRecord.id);
      
      if (!upError) {
        stats.updated++;
        auditLogs.push({
          user_id: USER_ID, profile_id: profileId, receipt_id: dbRecord.id,
          action: 'transaction_category_updated',
          details: { old_category: curCat?.name || 'Nenhum', new_category: targetCategoryName, reason: 'Correção Jan-Abr 2026' }
        });
      }
    }
  }

  if (auditLogs.length > 0) await supabaseAdmin.from('audit_logs').insert(auditLogs);

  console.log('\n--- RESULTADO ---');
  console.log(JSON.stringify(stats, null, 2));

  // Validação ARBOS
  const { data: val1 } = await supabaseAdmin.from('receipts').select('category_id').eq('amount', 3996).eq('payment_date', '2026-04-06').single();
  const { data: c1 } = await supabaseAdmin.from('categories').select('name').eq('id', val1?.category_id).single();
  console.log(`ARBOS (06/04): ${c1?.name} (Esperado: Educação)`);
  
  const { data: val2 } = await supabaseAdmin.from('receipts').select('category_id').eq('amount', 800).eq('payment_date', '2026-03-31').single();
  const { data: c2 } = await supabaseAdmin.from('categories').select('name').eq('id', val2?.category_id).single();
  console.log(`CANTINA (31/03): ${c2?.name} (Esperado: Restaurante Escolar)`);
}

run();
