import { supabaseAdmin } from './src/integrations/supabase/client.server';
import * as fs from 'fs';

const csvPath = "/mnt/user-uploads/meu-cofre-maio-junho-2026-categorias-padronizadas.csv";
const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';

const profileMap: Record<string, string> = {
  "Pessoal": "c44c244d-b05f-47dc-bc58-7056351e7703",
  "Holding": "2906fc21-93bc-42ad-8ca3-701b94fdb5f6"
};

function normalizeString(str: string): string {
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // Remove tudo que não é alfanumérico
}

async function main() {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].replace(/^\uFEFF/, '').split(';').map(h => h.replace(/"/g, '').trim());
  
  const csvData = lines.slice(1).filter(l => l.trim()).map(line => {
    // Regex melhorada para CSV com ponto-e-vírgula e aspas
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ';' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current);

    const obj: any = {};
    headers.forEach((h, i) => {
      obj[h] = (parts[i] || "").replace(/^"|"$/g, '').trim();
    });
    return obj;
  });

  console.log(`Lidos ${csvData.length} registros do CSV.`);

  const categoriesInCsv = Array.from(new Set(csvData.map(r => r.Categoria)));
  const categoryIdsByName: Record<string, string> = {};

  const { data: existingCats } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .eq('user_id', userId);
  
  existingCats?.forEach(c => {
    categoryIdsByName[c.name] = c.id;
  });

  for (const catName of categoriesInCsv) {
    if (!categoryIdsByName[catName]) {
      console.log(`Criando categoria "${catName}"...`);
      const { data: newCat } = await supabaseAdmin
        .from('categories')
        .insert({ name: catName, user_id: userId })
        .select()
        .single();
      if (newCat) categoryIdsByName[catName] = newCat.id;
    }
  }

  let updated = 0;
  let alreadyCorrect = 0;
  let notFound = 0;
  let ambigous = 0;

  for (const row of csvData) {
    const profileId = profileMap[row.Perfil];
    if (!profileId) continue;

    const [d, m, y] = row.Data.split('/');
    const dbDate = `${y}-${m}-${d}`;
    const amount = parseInt(row.Valor.replace(/[R$\s.]/g, '').replace(',', ''));
    const authCode = row.Autenticação;
    const recipientCsv = row.Destinatário;
    const targetCategoryName = row.Categoria;

    let query = supabaseAdmin
      .from('receipts')
      .select('id, recipient_name, category_id, categories(name)')
      .eq('profile_id', profileId)
      .eq('amount', amount);

    if (authCode) {
      query = query.eq('auth_code', authCode);
    } else {
      query = query.eq('payment_date', dbDate);
    }

    const { data: matches } = await query;

    if (!matches || matches.length === 0) {
      // Tentar apenas por data e valor se for sem authCode
      const { data: retryMatches } = await supabaseAdmin
        .from('receipts')
        .select('id, recipient_name, category_id, categories(name)')
        .eq('profile_id', profileId)
        .eq('amount', amount)
        .eq('payment_date', dbDate);
      
      if (retryMatches && retryMatches.length === 1) {
        await applyUpdate(retryMatches[0], targetCategoryName, profileId);
      } else {
        console.warn(`Não encontrado: ${row.Data} - ${recipientCsv} - ${row.Valor}`);
        notFound++;
      }
    } else if (matches.length === 1) {
      await applyUpdate(matches[0], targetCategoryName, profileId);
    } else {
      // Filtrar pelo nome do destinatário normalizado
      const normalizedCsv = normalizeString(recipientCsv);
      const filtered = matches.filter(m => normalizeString(m.recipient_name || "").includes(normalizedCsv.substring(0, 5)));
      
      if (filtered.length === 1) {
        await applyUpdate(filtered[0], targetCategoryName, profileId);
      } else if (filtered.length > 1) {
        ambigous++;
      } else {
        // Se a filtragem por nome falhou mas o auth_code bateu (caso raro), ou se são duplicatas exatas no banco
        await applyUpdate(matches[0], targetCategoryName, profileId);
      }
    }
  }

  async function applyUpdate(match: any, targetCategoryName: string, profileId: string) {
    const currentCategoryName = match.categories?.name;
    const targetCategoryId = categoryIdsByName[targetCategoryName];

    if (currentCategoryName === targetCategoryName) {
      alreadyCorrect++;
    } else {
      const { error: updateError } = await supabaseAdmin
        .from('receipts')
        .update({ category_id: targetCategoryId })
        .eq('id', match.id);

      if (!updateError) {
        updated++;
        await supabaseAdmin.from('audit_logs').insert({
          action: 'transaction_category_updated',
          entity: 'receipts',
          entity_id: match.id,
          user_id: userId,
          profile_id: profileId,
          old_value: { category: currentCategoryName },
          new_value: { category: targetCategoryName },
          note: 'Correção cirúrgica Maio/Junho 2026'
        });
      }
    }
  }

  console.log(`\nRESUMO FINAL:`);
  console.log(`Atualizados: ${updated}`);
  console.log(`Já corretos: ${alreadyCorrect}`);
  console.log(`Não encontrados: ${notFound}`);
  console.log(`Ambíguos: ${ambigous}`);
}

main();
