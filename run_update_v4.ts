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
  return parseFloat(clean);
}

async function run() {
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const allRecords = parse(csvContent, { columns: true, skip_empty_lines: true });

  const records = allRecords.filter(r => {
    const d = parseDate(r.Data);
    return d && d.getFullYear() === 2026 && d.getMonth() <= 3;
  });

  console.log(`Processando ${records.length} registros (Jan-Abr 2026).`);

  const { data: allCategories } = await supabaseAdmin.from('categories').select('id, name');
  const categoryMap = new Map();
  allCategories?.forEach(c => categoryMap.set(c.name.trim().toLowerCase(), c.id));

  async function getOrCreateCategory(name: string) {
    const normalized = name.trim().toLowerCase();
    if (categoryMap.has(normalized)) return categoryMap.get(normalized);

    console.log(`Criando categoria global "${name}"`);
    const { data: newCat, error } = await supabaseAdmin
      .from('categories')
      .insert({ name, user_id: USER_ID })
      .select('id')
      .single();

    if (error) {
      console.error(`Erro ao criar categoria ${name}:`, error);
      return null;
    }
    categoryMap.set(normalized, newCat.id);
    return newCat.id;
  }

  const { data: dbReceipts } = await supabaseAdmin
    .from('receipts')
    .select('id, category_id, payment_date, amount, recipient_name, auth_code, profile_id')
    .eq('user_id', USER_ID)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-04-30');

  const { data: profiles } = await supabaseAdmin.from('financial_profiles').select('id, name').eq('user_id', USER_ID);
  const profileMap = new Map();
  profiles?.forEach(p => profileMap.set(p.name, p.id));

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
      if (Math.abs(db.amount! - amount) > 0.01) return false;
      
      if (authCode && db.auth_code === authCode) return true;
      
      const dbDate = new Date(db.payment_date!);
      const diffDays = Math.abs((dbDate.getTime() - date!.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 2) return false;

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

    const targetCategoryId = await getOrCreateCategory(targetCategoryName);
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

  console.log('\n--- RESULTADO FINAL ---');
  console.log(JSON.stringify(stats, null, 2));

  // Validação
  const arbos = dbReceipts?.find(r => r.amount === 3996 && r.payment_date === '2026-04-06');
  if (arbos) {
    const { data: r } = await supabaseAdmin.from('receipts').select('category_id').eq('id', arbos.id).single();
    const { data: c } = await supabaseAdmin.from('categories').select('name').eq('id', r?.category_id).single();
    console.log(`ARBOS (06/04): ${c?.name} (Esperado: Educação)`);
  }
}

run();
