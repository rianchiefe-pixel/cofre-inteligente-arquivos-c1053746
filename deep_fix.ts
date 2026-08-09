import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  // 1. Precise Category mapping
  const mapping: Record<string, string> = {
    'Academia': 'gasto_fixo',
    'APAE': 'gasto_fixo',
    'Condomínio': 'gasto_fixo',
    'Educação': 'gasto_fixo',
    'KUMON': 'gasto_fixo',
    'Internet': 'gasto_fixo',
    'Telefone': 'gasto_fixo',
    'TV': 'gasto_fixo',
    'Pensão': 'gasto_fixo',
    'Plano de Saúde': 'gasto_fixo',
    'Convênio': 'gasto_fixo',
    'Seguro de Veículos': 'gasto_fixo',
    'Seguros Carro': 'gasto_fixo',
    'Casa 25 - Cota Condominial': 'gasto_fixo',
    'Casa 26 - Cota Condominial': 'gasto_fixo',
    'Cond Sala comercial': 'gasto_fixo',
    'Alimentação': 'gasto_variavel',
    'Combustível': 'gasto_variavel',
    'Diarista': 'gasto_variavel',
    'Farmácia': 'gasto_variavel',
    'Personal': 'gasto_variavel',
    'Pediatria': 'gasto_variavel',
    'Pediatra': 'gasto_variavel',
    'Saúde': 'gasto_variavel',
    'Saúde Leila': 'gasto_variavel',
    'Saúde Henrique': 'gasto_variavel'
  };

  const { data: categories } = await supabase.from('categories').select('*').eq('user_id', userId);
  if (!categories) return;

  const fixosLog: string[] = [];
  const variaveisLog: string[] = [];
  let totalReceiptsUpdated = 0;

  for (const cat of categories) {
    let targetType: string | null = null;
    const lowerName = cat.name.toLowerCase();

    for (const [kw, type] of Object.entries(mapping)) {
      if (lowerName.includes(kw.toLowerCase())) {
        targetType = type;
        break;
      }
    }

    if (targetType) {
      if (targetType === 'gasto_fixo') fixosLog.push(cat.name);
      else variaveisLog.push(cat.name);

      // Update category
      await supabase.from('categories').update({ default_type: targetType }).eq('id', cat.id);

      // Force update ALL receipts for this category to ensure consistency
      const { data: affectedReceipts } = await supabase
        .from('receipts')
        .select('id')
        .eq('category_id', cat.id)
        .eq('profile_id', profileId);

      if (affectedReceipts && affectedReceipts.length > 0) {
        const ids = affectedReceipts.map(r => r.id);
        const { error } = await supabase.from('receipts').update({ transaction_type: targetType }).in('id', ids);
        if (!error) totalReceiptsUpdated += ids.length;
      }
    }
  }

  // Final totals for Jan-Apr
  const { data: finalReceipts } = await supabase
    .from('receipts')
    .select('amount, transaction_type')
    .eq('profile_id', profileId)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-04-30');

  const fixosTotal = finalReceipts?.filter(r => r.transaction_type === 'gasto_fixo').reduce((sum, r) => sum + Number(r.amount), 0) || 0;
  const variaveisTotal = finalReceipts?.filter(r => r.transaction_type === 'gasto_variavel').reduce((sum, r) => sum + Number(r.amount), 0) || 0;

  console.log(JSON.stringify({
    profile_id: profileId,
    fixos_categories: fixosLog,
    variaveis_categories: variaveisLog,
    receipts_updated: totalReceiptsUpdated,
    jan_apr_totals: {
      fixos: fixosTotal,
      variaveis: variaveisTotal
    }
  }, null, 2));
}

run();
