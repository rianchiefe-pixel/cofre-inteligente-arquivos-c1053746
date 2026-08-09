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
  const clean = amountStr.replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
  const val = parseFloat(clean);
  return Math.round(val * 100);
}

async function run() {
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const allRecords = parse(csvContent, { columns: true, skip_empty_lines: true });

  const records = allRecords.filter(r => {
    const d = parseDate(r.Data);
    return d && d.getMonth() <= 3; // Jan-Abr
  });

  console.log(`Processando ${records.length} registros (Jan-Abr).`);

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

    const { data: newCat, error } = await supabaseAdmin.from('categories').insert({ name, profile_id: profileId, user_id: USER_ID }).select('id').single();
    if (error) return null;
    if (!categoryMapByProfile.has(profileId)) categoryMapByProfile.set(profileId, new Map());
    categoryMapByProfile.get(profileId).set(normalized, newCat.id);
    return newCat.id;
  }

  // Carregar todos os lançamentos do período de uma vez para ganhar performance
  const { data: dbReceipts } = await supabaseAdmin
    .from('receipts')
    .select('id, category_id, payment_date, amount, recipient_name, auth_code, profile_id')
    .eq('user_id', USER_ID)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-04-30');

  console.log(`Lançamentos Jan-Abr no banco: ${dbReceipts?.length || 0}`);

  let stats = { found: 0, updated: 0, alreadyCorrect: 0, notFound: 0 };
  const auditLogs = [];
  const updates = [];

  for (const record of records) {
    const date = parseDate(record.Data);
    const dateStr = date!.toISOString().split('T')[0];
    const amount = parseAmount(record.Valor);
    const recipient = record.Destinatário.trim().toLowerCase();
    const targetCategoryName = record.Categoria.trim();
    const profileId = profileMap.get(record.Perfil.trim());
    const authCode = record.Autenticação?.trim();

    if (!profileId) continue;

    const matches = dbReceipts?.filter(db => {
      if (db.profile_id !== profileId) return false;
      if (db.amount !== amount) return false;
      if (authCode && db.auth_code === authCode) return true;
      
      const dbDate = new Date(db.payment_date!);
      const diffDays = Math.abs((dbDate.getTime() - date!.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 2) return false;

      return db.recipient_name?.toLowerCase().includes(recipient.substring(0, 5));
    });

    if (!matches || matches.length === 0) {
      stats.notFound++;
      continue;
    }

    const dbRecord = matches[0];
    stats.found++;

    const targetCategoryId = await getOrCreateCategory(targetCategoryName, profileId);
    if (dbRecord.category_id === targetCategoryId) {
      stats.alreadyCorrect++;
    } else {
      updates.push({ id: dbRecord.id, category_id: targetCategoryId });
      const { data: curCat } = await supabaseAdmin.from('categories').select('name').eq('id', dbRecord.category_id).single();
      auditLogs.push({
        user_id: USER_ID, profile_id: profileId, receipt_id: dbRecord.id,
        action: 'transaction_category_updated',
        details: { old_category: curCat?.name || 'Nenhum', new_category: targetCategoryName, reason: 'Correção Jan-Abr 2026' }
      });
    }
  }

  // Executar Updates em paralelo/lote
  console.log(`Iniciando ${updates.length} updates...`);
  for (const up of updates) {
    await supabaseAdmin.from('receipts').update({ category_id: up.category_id, updated_at: new Date().toISOString() }).eq('id', up.id);
  }

  if (auditLogs.length > 0) await supabaseAdmin.from('audit_logs').insert(auditLogs);

  console.log('\n--- RESULTADO ---');
  console.log(JSON.stringify(stats, null, 2));

  // Validação ARBOS
  const { data: val1 } = await supabaseAdmin.from('receipts').select('category_id').eq('amount', 399600).eq('payment_date', '2026-04-05').single();
  const { data: c1 } = await supabaseAdmin.from('categories').select('name').eq('id', val1?.category_id).single();
  console.log(`ARBOS: ${c1?.name} (Esperado: Educação)`);
}

run();
