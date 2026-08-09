import { supabaseAdmin } from './src/integrations/supabase/client.server';
import * as fs from 'fs';

const csvPath = "/mnt/user-uploads/meu-cofre-maio-junho-2026-categorias-padronizadas.csv";
const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';

// Mapeamento de perfis (conforme descoberto)
const profileMap: Record<string, string> = {
  "Pessoal": "c44c244d-b05f-47dc-bc58-7056351e7703",
  "Holding": "2906fc21-93bc-42ad-8ca3-701b94fdb5f6"
};

async function main() {
  const content = fs.readFileSync(csvPath, 'utf-8');
  // Processamento manual do CSV para evitar problemas com delimitadores e aspas
  const lines = content.split('\n');
  const headers = lines[0].replace(/^\uFEFF/, '').split(';').map(h => h.replace(/"/g, '').trim());
  
  const csvData = lines.slice(1).filter(l => l.trim()).map(line => {
    // Regex para lidar com campos entre aspas contendo o delimitador
    const parts = line.match(/(".*?"|[^;]+)(?=\s*;|\s*$)/g) || [];
    const obj: any = {};
    headers.forEach((h, i) => {
      let val = parts[i] || "";
      obj[h] = val.replace(/^"|"$/g, '').trim();
    });
    return obj;
  });

  console.log(`Lidos ${csvData.length} registros do CSV.`);

  // 1. Garantir que as categorias existem
  const categoriesInCsv = Array.from(new Set(csvData.map(r => r.Categoria)));
  const categoryIdsByName: Record<string, Record<string, string>> = {}; // profileId -> {name -> id}

  for (const profileName in profileMap) {
    const profileId = profileMap[profileName];
    const { data: existingCats } = await supabaseAdmin
      .from('categories')
      .select('id, name')
      .eq('user_id', userId); // Categorias costumam ser globais do usuário ou vinculadas? 
      // Olhando o schema, categories tem user_id. 
    
    categoryIdsByName[profileId] = {};
    existingCats?.forEach(c => {
      categoryIdsByName[profileId][c.name] = c.id;
    });

    for (const catName of categoriesInCsv) {
      if (!categoryIdsByName[profileId][catName]) {
        console.log(`Criando categoria "${catName}" para o usuário...`);
        const { data: newCat, error } = await supabaseAdmin
          .from('categories')
          .insert({ name: catName, user_id: userId })
          .select()
          .single();
        if (newCat) {
          categoryIdsByName[profileId][catName] = newCat.id;
        } else {
          console.error(`Erro ao criar categoria ${catName}:`, error);
        }
      }
    }
  }

  // 2. Processar atualizações
  let processed = 0;
  let updated = 0;
  let alreadyCorrect = 0;
  let notFound = 0;
  let ambigous = 0;

  for (const row of csvData) {
    const profileId = profileMap[row.Perfil];
    if (!profileId) {
      console.warn(`Perfil não encontrado: ${row.Perfil}`);
      continue;
    }

    const dateStr = row.Data; // "29/06/2026"
    const [d, m, y] = dateStr.split('/');
    const dbDate = `${y}-${m}-${d}`;
    
    const amount = parseInt(row.Valor.replace(/[R$\s.]/g, '').replace(',', ''));
    const recipient = row.Destinatário;
    const authCode = row.Autenticação;
    const targetCategoryName = row.Categoria;

    // Busca robusta
    let query = supabaseAdmin
      .from('receipts')
      .select('id, category_id, categories(name)')
      .eq('profile_id', profileId)
      .eq('amount', amount);

    // Se tiver código de autenticação, usa como filtro forte
    if (authCode) {
      query = query.eq('auth_code', authCode);
    } else {
      // Caso contrário, usa data e destinatário (aproximado)
      query = query.eq('payment_date', dbDate).ilike('recipient_name', `%${recipient.substring(0, 10)}%`);
    }

    const { data: matches, error } = await query;

    if (error || !matches || matches.length === 0) {
      // Tentar sem o destinatário se falhar, apenas por data e valor
      const { data: retryMatches } = await supabaseAdmin
        .from('receipts')
        .select('id, category_id, categories(name)')
        .eq('profile_id', profileId)
        .eq('amount', amount)
        .eq('payment_date', dbDate);
      
      if (retryMatches && retryMatches.length === 1) {
        await applyUpdate(retryMatches[0], targetCategoryName, profileId);
      } else if (retryMatches && retryMatches.length > 1) {
        console.warn(`Ambiguidade para ${dateStr} - ${recipient} - ${row.Valor}`);
        ambigous++;
      } else {
        console.warn(`Não encontrado: ${dateStr} - ${recipient} - ${row.Valor}`);
        notFound++;
      }
    } else if (matches.length === 1) {
      await applyUpdate(matches[0], targetCategoryName, profileId);
    } else {
      console.warn(`Ambiguidade para ${dateStr} - ${recipient} - ${row.Valor}`);
      ambigous++;
    }
    processed++;
  }

  async function applyUpdate(match: any, targetCategoryName: string, profileId: string) {
    const currentCategoryName = match.categories?.name;
    const targetCategoryId = categoryIdsByName[profileId][targetCategoryName];

    if (currentCategoryName === targetCategoryName) {
      alreadyCorrect++;
    } else {
      const { error: updateError } = await supabaseAdmin
        .from('receipts')
        .update({ category_id: targetCategoryId })
        .eq('id', match.id);

      if (!updateError) {
        updated++;
        // Registrar Auditoria
        await supabaseAdmin.from('audit_logs').insert({
          action: 'transaction_category_updated',
          entity: 'receipts',
          entity_id: match.id,
          user_id: userId,
          profile_id: profileId,
          old_value: { category: currentCategoryName },
          new_value: { category: targetCategoryName },
          note: 'Correção em lote Maio/Junho 2026 via Modo Construção'
        });
      } else {
        console.error(`Erro ao atualizar ${match.id}:`, updateError);
      }
    }
  }

  console.log(`\nRELATÓRIO DE EXECUÇÃO:`);
  console.log(`CSV Total: ${csvData.length}`);
  console.log(`Processados: ${processed}`);
  console.log(`Atualizados: ${updated}`);
  console.log(`Já estavam corretos: ${alreadyCorrect}`);
  console.log(`Não encontrados: ${notFound}`);
  console.log(`Ambíguos: ${ambigous}`);
}

main();
