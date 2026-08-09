import { supabaseAdmin } from './src/integrations/supabase/client.server';
import * as fs from 'fs';

const csvPath = "/mnt/user-uploads/meu-cofre-maio-junho-2026-categorias-padronizadas.csv";
const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';

const profileMap: Record<string, string> = {
  "Pessoal": "c44c244d-b05f-47dc-bc58-7056351e7703",
  "Holding": "2906fc21-93bc-42ad-8ca3-701b94fdb5f6"
};

function normalizeString(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].replace(/^\uFEFF/, '').split(';').map(h => h.replace(/"/g, '').trim());
  
  const csvData = lines.slice(1).filter(l => l.trim()).map(line => {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ';' && !inQuotes) { parts.push(current); current = ''; }
      else current += char;
    }
    parts.push(current);
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = (parts[i] || "").replace(/^"|"$/g, '').trim(); });
    return obj;
  });

  console.log(`Lidos ${csvData.length} registros do CSV.`);

  const categoryIdsByName: Record<string, string> = {};
  const { data: existingCats } = await supabaseAdmin.from('categories').select('id, name').eq('user_id', userId);
  existingCats?.forEach(c => categoryIdsByName[c.name] = c.id);

  let updated = 0;
  let alreadyCorrect = 0;
  let notFound = 0;

  for (const row of csvData) {
    const profileId = profileMap[row.Perfil];
    if (!profileId) continue;

    const [d, m, y] = row.Data.split('/');
    const date = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    const dbDate = date.toISOString().split('T')[0];
    
    // CORREÇÃO: Pegar o valor "inteiro" (3996,00 -> 3996)
    // R$ 3.000,00 -> 3000
    // R$ 50,56 -> 50.56
    const amountStr = row.Valor.replace(/[R$\s.]/g, '').replace(',', '.');
    const amount = parseFloat(amountStr);
    
    const authCode = row.Autenticação;
    const recipientCsv = row.Destinatário;
    const targetCategoryName = row.Categoria;

    let query = supabaseAdmin
      .from('receipts')
      .select('id, recipient_name, amount, payment_date, auth_code, category_id, categories(name)')
      .eq('profile_id', profileId)
      .eq('amount', amount);

    if (authCode) {
      query = query.eq('auth_code', authCode);
    } else {
      query = query.eq('payment_date', dbDate);
    }

    const { data: matches } = await query;

    let match = null;
    if (matches && matches.length === 1) {
      match = matches[0];
    } else if (matches && matches.length > 1) {
      const normCsv = normalizeString(recipientCsv);
      const filtered = matches.filter(m => normalizeString(m.recipient_name || "").includes(normCsv.substring(0, 5)));
      match = filtered[0] || matches[0];
    } else {
        // Tentar ±3 dias
        const dateStart = new Date(date); dateStart.setDate(dateStart.getDate() - 3);
        const dateEnd = new Date(date); dateEnd.setDate(dateEnd.getDate() + 3);
        const { data: retryMatches } = await supabaseAdmin
          .from('receipts')
          .select('id, recipient_name, amount, payment_date, auth_code, category_id, categories(name)')
          .eq('profile_id', profileId)
          .eq('amount', amount)
          .gte('payment_date', dateStart.toISOString().split('T')[0])
          .lte('payment_date', dateEnd.toISOString().split('T')[0]);
        
        if (retryMatches && retryMatches.length > 0) {
            const normCsv = normalizeString(recipientCsv);
            const nameMatches = retryMatches.filter(m => normalizeString(m.recipient_name || "").includes(normCsv.substring(0, 5)));
            match = nameMatches[0] || retryMatches[0];
        }
    }

    if (match) {
      const currentCategoryName = match.categories?.name;
      const targetCategoryId = categoryIdsByName[targetCategoryName];
      if (currentCategoryName === targetCategoryName) alreadyCorrect++;
      else {
        const { error: updateError } = await supabaseAdmin.from('receipts').update({ category_id: targetCategoryId }).eq('id', match.id);
        if (!updateError) {
          updated++;
          await supabaseAdmin.from('audit_logs').insert({
            action: 'transaction_category_updated',
            entity: 'receipts',
            entity_id: match.id, user_id: userId, profile_id: profileId,
            old_value: { category: currentCategoryName },
            new_value: { category: targetCategoryName },
            note: 'Correção cirúrgica Maio/Junho 2026'
          });
        }
      }
    } else {
      console.warn(`Não encontrado: ${row.Data} - ${recipientCsv} - ${row.Valor} (Float: ${amount})`);
      notFound++;
    }
  }

  console.log(`\nRESUMO FINAL:`);
  console.log(`Atualizados: ${updated}`);
  console.log(`Já corretos: ${alreadyCorrect}`);
  console.log(`Não encontrados: ${notFound}`);
}

main();
