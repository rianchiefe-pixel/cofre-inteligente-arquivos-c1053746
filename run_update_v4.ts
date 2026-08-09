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
  // Remove "R$", espaços, pontos de milhar e substitui vírgula decimal por ponto
  const clean = amountStr.replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
  const val = parseFloat(clean);
  return Math.round(val * 100); // Em centavos
}

async function run() {
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`Lendo ${records.length} registros do CSV.`);

  // 1. Mapear Categorias (Nome -> ID) para cada perfil
  const { data: profiles } = await supabaseAdmin
    .from('financial_profiles')
    .select('id, name')
    .eq('user_id', USER_ID);

  const profileMap = new Map();
  profiles?.forEach(p => profileMap.set(p.name, p.id));
  console.log('Perfis encontrados:', JSON.stringify(profiles, null, 2));

  const categoryMapByProfile = new Map();
  const { data: allCategories } = await supabaseAdmin
    .from('categories')
    .select('id, name, profile_id');

  allCategories?.forEach(c => {
    if (!categoryMapByProfile.has(c.profile_id)) {
      categoryMapByProfile.set(c.profile_id, new Map());
    }
    categoryMapByProfile.get(c.profile_id).set(c.name.trim().toLowerCase(), c.id);
  });

  async function getOrCreateCategory(name: string, profileId: string) {
    const pCats = categoryMapByProfile.get(profileId);
    const normalized = name.trim().toLowerCase();
    if (pCats && pCats.has(normalized)) {
      return pCats.get(normalized);
    }

    console.log(`Criando categoria "${name}" para perfil ${profileId}`);
    const { data: newCat, error } = await supabaseAdmin
      .from('categories')
      .insert({ name, profile_id: profileId, user_id: USER_ID })
      .select('id')
      .single();

    if (error) {
      console.error(`Erro ao criar categoria ${name}:`, error);
      return null;
    }

    if (!categoryMapByProfile.has(profileId)) {
      categoryMapByProfile.set(profileId, new Map());
    }
    categoryMapByProfile.get(profileId).set(normalized, newCat.id);
    return newCat.id;
  }

  // 2. Processar registros
  let stats = {
    total: records.length,
    found: 0,
    alreadyCorrect: 0,
    updated: 0,
    notFound: 0,
    ambiguous: 0,
    integrityErrors: 0
  };

  const auditLogs = [];

  for (const record of records) {
    const date = parseDate(record.Data);
    if (!date || date.getMonth() > 3) continue; // Só Jan-Abr (0-3)

    const amount = parseAmount(record.Valor);
    const recipient = record.Destinatário.trim();
    const targetCategoryName = record.Categoria.trim();
    const profileName = record.Perfil.trim();
    const authCode = record.Autenticação ? record.Autenticação.trim() : null;

    const profileId = profileMap.get(profileName);
    if (!profileId) {
      console.warn(`Perfil não encontrado para o registro: ${profileName}`);
      continue;
    }

    // Busca no banco
    let query = supabaseAdmin
      .from('receipts')
      .select('id, category_id, payment_date, amount, recipient_name, auth_code, profile_id')
      .eq('user_id', USER_ID)
      .eq('amount', amount)
      .eq('profile_id', profileId);

    if (authCode) {
      query = query.eq('auth_code', authCode);
    } else {
      // Flexibilidade de data (+/- 2 dias)
      const dMin = new Date(date);
      dMin.setDate(dMin.getDate() - 2);
      const dMax = new Date(date);
      dMax.setDate(dMax.getDate() + 2);
      
      query = query
        .gte('payment_date', dMin.toISOString().split('T')[0])
        .lte('payment_date', dMax.toISOString().split('T')[0])
        .ilike('recipient_name', `%${recipient.substring(0, 5)}%`);
    }

    const { data: matches, error: matchError } = await query;

    if (matchError || !matches || matches.length === 0) {
      stats.notFound++;
      // console.log(`Não encontrado: ${record.Data} | ${record.Destinatário} | ${record.Valor}`);
      continue;
    }

    if (matches.length > 1) {
      // Tentar desempatar por nome exato ou código
      const exactMatches = matches.filter(m => 
        (m.recipient_name?.toLowerCase() === recipient.toLowerCase()) ||
        (m.auth_code && m.auth_code === authCode)
      );
      
      if (exactMatches.length !== 1) {
        stats.ambiguous++;
        continue;
      }
      matches[0] = exactMatches[0];
    }

    const dbRecord = matches[0];
    stats.found++;

    // Verificar categoria
    const targetCategoryId = await getOrCreateCategory(targetCategoryName, profileId);
    
    // Obter nome da categoria atual
    const { data: currentCat } = await supabaseAdmin.from('categories').select('name').eq('id', dbRecord.category_id).single();
    const currentCategoryName = currentCat?.name || 'Nenhum';

    if (dbRecord.category_id === targetCategoryId) {
      stats.alreadyCorrect++;
    } else {
      // UPDATE REAL
      const { error: updateError } = await supabaseAdmin
        .from('receipts')
        .update({ category_id: targetCategoryId, updated_at: new Date().toISOString() })
        .eq('id', dbRecord.id);

      if (updateError) {
        console.error(`Erro ao atualizar registro ${dbRecord.id}:`, updateError);
        stats.integrityErrors++;
      } else {
        stats.updated++;
        auditLogs.push({
          user_id: USER_ID,
          profile_id: profileId,
          receipt_id: dbRecord.id,
          action: 'transaction_category_updated',
          details: {
            old_category: currentCategoryName,
            new_category: targetCategoryName,
            reason: 'Correção em lote Jan-Abr 2026 via CSV',
            executed_at: new Date().toISOString()
          }
        });
      }
    }
  }

  // 3. Persistir Auditoria
  if (auditLogs.length > 0) {
    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert(auditLogs);
    if (auditError) console.error('Erro ao gravar auditoria:', auditError);
  }

  // 4. Testes Obrigatórios
  console.log('\n--- RELATÓRIO DE EXECUÇÃO ---');
  console.log(`Total registros Jan-Abr CSV: ${records.filter(r => parseDate(r.Data) && parseDate(r.Data)!.getMonth() <= 3).length}`);
  console.log(JSON.stringify(stats, null, 2));

  // Teste ARBOS (05/04/2026 - R$ 3.996,00)
  const { data: test1 } = await supabaseAdmin
    .from('receipts')
    .select('recipient_name, amount, payment_date, category_id')
    .eq('user_id', USER_ID)
    .eq('amount', 399600)
    .eq('payment_date', '2026-04-05')
    .single();
  
  if (test1) {
    const { data: c1 } = await supabaseAdmin.from('categories').select('name').eq('id', test1.category_id).single();
    console.log(`\nTESTE ARBOS: ${c1?.name === 'Educação' ? '✅' : '❌'} (${c1?.name})`);
  } else {
    console.log('\nTESTE ARBOS: ❌ Não encontrado no banco');
  }

  // Teste Cantina (30/03/2026 - R$ 800,00)
  const { data: test2 } = await supabaseAdmin
    .from('receipts')
    .select('recipient_name, amount, payment_date, category_id')
    .eq('user_id', USER_ID)
    .eq('amount', 80000)
    .eq('payment_date', '2026-03-30')
    .single();

  if (test2) {
    const { data: c2 } = await supabaseAdmin.from('categories').select('name').eq('id', test2.category_id).single();
    console.log(`TESTE CANTINA: ${c2?.name === 'Restaurante Escolar' ? '✅' : '❌'} (${c2?.name})`);
  } else {
    // Tentar busca flexível se falhou por data exata
    const { data: test2Flex } = await supabaseAdmin
      .from('receipts')
      .select('recipient_name, amount, payment_date, category_id')
      .eq('user_id', USER_ID)
      .eq('amount', 80000)
      .ilike('recipient_name', '%Cantina%')
      .single();
    
    if (test2Flex) {
      const { data: c2 } = await supabaseAdmin.from('categories').select('name').eq('id', test2Flex.category_id).single();
      console.log(`TESTE CANTINA (FLEX): ${c2?.name === 'Restaurante Escolar' ? '✅' : '❌'} (${c2?.name} - ${test2Flex.payment_date})`);
    } else {
      console.log('TESTE CANTINA: ❌ Não encontrado');
    }
  }
}

run();
