import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  // 1. Fetch all categories
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId);

  if (!categories) return;

  const fixoKeywords = [
    'Academia', 'APAE', 'Condomínio', 'Educação', 'KUMON', 'Internet', 'Telefone', 
    'TV', 'Pensão', 'Plano de Saúde', 'Convênio', 'Seguros Carro', 'Seguro de Veículos',
    'Casa 25 - Cota Condominial', 'Casa 26 - Cota Condominial', 'Cond Sala comercial'
  ];

  const variavelKeywords = [
    'Alimentação', 'Combustível', 'Diarista', 'Farmácia', 'Personal', 'Pediatria', 'Pediatra'
  ];

  const skipKeywords = [
    'Imóveis', 'Parcela de imóvel', 'Sala Comercial Leila', 'Terrenos', 'Aquisição patrimonial', 'Investimento'
  ];

  const log: any[] = [];
  let receiptsUpdatedCount = 0;
  const reviewNeeded: string[] = [];

  for (const cat of categories) {
    const name = cat.name.toLowerCase();
    let newType: string | null = null;

    // Check skip first
    if (skipKeywords.some(kw => name.includes(kw.toLowerCase()))) {
        continue;
    }

    // Determine new type
    if (fixoKeywords.some(kw => name.includes(kw.toLowerCase()))) {
      newType = 'gasto_fixo';
    } else if (variavelKeywords.some(kw => name.includes(kw.toLowerCase()))) {
      newType = 'gasto_variavel';
    }

    // Special logic for "Saúde" (Variable by default unless it's a plan)
    if (name === 'saúde' || name === 'saúde leila' || name === 'saúde henrique') {
        newType = 'gasto_variavel';
    }

    if (newType && newType !== cat.default_type) {
      // Update Category
      const { error: catUpdateError } = await supabase
        .from('categories')
        .update({ default_type: newType })
        .eq('id', cat.id);

      if (!catUpdateError) {
        log.push({
          category_id: cat.id,
          name: cat.name,
          old_type: cat.default_type,
          new_type: newType,
          motivo: 'Relatório oficial Jan-Abr/2026'
        });

        // Update Receipts for this category and profile
        const { data: receiptsToUpdate } = await supabase
            .from('receipts')
            .select('id')
            .eq('category_id', cat.id)
            .eq('profile_id', profileId);
            
        if (receiptsToUpdate && receiptsToUpdate.length > 0) {
            const receiptIds = receiptsToUpdate.map(r => r.id);
            const { error: receiptUpdateError } = await supabase
                .from('receipts')
                .update({ transaction_type: newType })
                .in('id', receiptIds);
            
            if (!receiptUpdateError) {
                receiptsUpdatedCount += receiptIds.length;
            }
        }
      }
    }
  }

  // Calculate totals for Jan-Apr after correction
  const { data: finalReceipts } = await supabase
    .from('receipts')
    .select('amount_centavos, transaction_type, date')
    .eq('profile_id', profileId)
    .gte('date', '2026-01-01')
    .lte('date', '2026-04-30');

  const calcTotal = (type: string) => finalReceipts
    ?.filter(r => r.transaction_type === type)
    .reduce((sum, r) => sum + r.amount_centavos, 0) || 0;

  console.log(JSON.stringify({
    profile_id: profileId,
    categories_updated: log,
    receipts_updated_count: receiptsUpdatedCount,
    totals_jan_apr: {
      fixos: calcTotal('gasto_fixo') / 100,
      variaveis: calcTotal('gasto_variavel') / 100
    },
    review_needed: reviewNeeded
  }, null, 2));
}

run();
