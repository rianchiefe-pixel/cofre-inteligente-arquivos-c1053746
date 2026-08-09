import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function unify() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  
  console.log('--- INICIANDO UNIFICAÇÃO LEILIANE/PESSOAL ---');

  const getCatId = async (name: string) => {
    const { data } = await supabaseAdmin.from('categories').select('id').eq('user_id', userId).eq('name', name).maybeSingle();
    return data?.id;
  };

  const targets = [
    { from: 'Alimentação Henrique', to: 'Alimentação Henrique' }, // Já está correto
    { from: 'Multas de Trânsito', to: 'Multas de Trânsito' }, // Já está correto
    { from: 'Entretenimento', to: 'Entretenimento' },
    { from: 'Pensão Alimentícia - Erick', to: 'Pensão Alimentícia - Erick' },
    { from: 'Casa 25 - Cota Condominial', to: 'Casa 25 - Cota Condominial' },
    { from: 'Casa 26 - Cota Condominial', to: 'Casa 26 - Cota Condominial' }
  ];

  // Vamos buscar por nomes que podem estar no banco mas não listamos
  const customTargets = [
     { from: 'Alimentaação henrique', to: 'Alimentação Henrique' },
     { from: 'multa de trânsito', to: 'Multas de Trânsito' },
     { from: 'Multas de trânsito', to: 'Multas de Trânsito' },
     { from: 'Lazer/Entreterimento', to: 'Entretenimento' },
     { from: 'Pensão Erick', to: 'Pensão Alimentícia - Erick' },
     { from: 'COND CASA 25', to: 'Casa 25 - Cota Condominial' },
     { from: 'Cond Casa 26', to: 'Casa 26 - Cota Condominial' }
  ];

  const renames = [
    { old: 'Açaí', new: 'Açaí' }, // Já está correto
    { old: 'Assistência', new: 'Assistência' }, // Já está correto
    { old: 'Consórcio Embracon', new: 'Consórcio Embracon' }, // Já está correto
    { old: 'Diarista', new: 'Diarista' }, // Já está correto
    { old: 'Internet', new: 'Internet' }, // Já está correto
    { old: 'Mercado Livre', new: 'Mercado Livre' }, // Já está correto
    { old: 'iFood', new: 'iFood' }, // Já está correto
    { old: 'Tarifas', new: 'Tarifas' }, // Já está correto
    { old: 'Procuração', new: 'Procuração' }, // Já está correto
    { old: 'Sala Comercial Leila', new: 'Sala Comercial Leila' } // Já está correto
  ];

  let totalMigrated = 0;

  // No log anterior, vi que muitas categorias já estão com o nome correto.
  // Vou buscar variações case-insensitive para garantir que nada escape.

  console.log('\n--- VERIFICANDO VARIAÇÕES PARA UNIFICAÇÃO ---');
  for (const t of customTargets) {
     const { data: sources } = await supabaseAdmin.from('categories').select('id, name').eq('user_id', userId).ilike('name', t.from);
     const targetId = await getCatId(t.to);
     
     if (sources && targetId) {
        for (const s of sources) {
           if (s.id === targetId) continue;
           console.log(`Unificando variação: ${s.name} (${s.id}) -> ${t.to} (${targetId})`);
           const { data: moved } = await supabaseAdmin.from('receipts').update({ category_id: targetId }).eq('category_id', s.id).select('id');
           totalMigrated += (moved?.length || 0);
           await supabaseAdmin.from('categories').update({ archived: true, name: `${s.name} [MERGED]` }).eq('id', s.id);
        }
     }
  }

  // REPARAR [MERGED]
  console.log('\n--- REPARANDO [MERGED] ---');
  const { data: mergedCats } = await supabaseAdmin.from('categories').select('id, name').eq('user_id', userId).ilike('name', '%[MERGED]%');
  for (const mc of (mergedCats || [])) {
     // Extrair o nome original do final do [MERGED]
     // Ex: "[MERGED] 2026-08-09T21:17:51.143Z - Alimentação Henrique"
     const parts = mc.name.split(' - ');
     if (parts.length > 1) {
        const cleanName = parts[parts.length - 1].trim();
        const canonicalId = await getCatId(cleanName);
        if (canonicalId && canonicalId !== mc.id) {
           const { data: moved } = await supabaseAdmin.from('receipts').update({ category_id: canonicalId }).eq('category_id', mc.id).select('id');
           if (moved && moved.length > 0) {
              totalMigrated += moved.length;
              console.log(`Reparado [MERGED]: ${mc.name} -> ${cleanName}. Movidos ${moved.length} receipts.`);
           }
        }
     }
  }

  console.log(`\nTOTAL DE RECEIPTS MIGRADOS/CORRIGIDOS: ${totalMigrated}`);
}

unify();
