import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function unify() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  
  console.log('--- INICIANDO UNIFICAÇÃO LEILIANE/PESSOAL ---');

  // Auxiliar para pegar ID por nome exato ou aproximado
  const getCatId = async (name: string) => {
    const { data } = await supabaseAdmin.from('categories').select('id').eq('user_id', userId).eq('name', name).maybeSingle();
    return data?.id;
  };

  const targets = [
    { from: 'Alimentaação henrique', to: 'Alimentação Henrique' },
    { from: 'multa de trânsito', to: 'Multas de Trânsito' },
    { from: 'Multas de trânsito', to: 'Multas de Trânsito' },
    { from: 'Lazer/Entreterimento', to: 'Entretenimento' },
    { from: 'Pensão Erick', to: 'Pensão Alimentícia - Erick' },
    { from: 'COND CASA 25', to: 'Casa 25 - Cota Condominial' },
    { from: 'Cond Casa 26', to: 'Casa 26 - Cota Condominial' }
  ];

  const renames = [
    { old: 'DIARISTA', new: 'Diarista' },
    { old: 'INTERNET', new: 'Internet' },
    { old: 'MERCADO LIVRE', new: 'Mercado Livre' },
    { old: 'IFOOD', new: 'iFood' },
    { old: 'Açai', new: 'Açaí' },
    { old: 'tarifas', new: 'Tarifas' },
    { old: 'procuração', new: 'Procuração' },
    { old: 'assistência', new: 'Assistência' },
    { old: 'Consórcio embracon', new: 'Consórcio Embracon' },
    { old: 'Sala comercial leila', new: 'Sala Comercial Leila' }
  ];

  let totalMigrated = 0;

  // 1. Processar Renomeações
  console.log('\n--- RENOMEANDO ---');
  for (const r of renames) {
    const id = await getCatId(r.old);
    if (id) {
       const { error } = await supabaseAdmin.from('categories').update({ name: r.new }).eq('id', id);
       if (error) console.error(`Erro renomeando ${r.old}:`, error);
       else console.log(`Renomeado: ${r.old} -> ${r.new}`);
    }
  }

  // 2. Processar Unificações
  console.log('\n--- UNIFICANDO ---');
  for (const t of targets) {
    const sourceId = await getCatId(t.from);
    const targetId = await getCatId(t.to);
    
    if (sourceId && targetId && sourceId !== targetId) {
      console.log(`Unificando ${t.from} (${sourceId}) -> ${t.to} (${targetId})`);
      
      // Migrar receipts
      const { data: moved, error: moveError } = await supabaseAdmin
        .from('receipts')
        .update({ category_id: targetId })
        .eq('category_id', sourceId)
        .select('id');
      
      if (moveError) console.error(`Erro movendo receipts de ${t.from}:`, moveError);
      else {
        totalMigrated += (moved?.length || 0);
        console.log(`Migrados ${moved?.length || 0} receipts.`);
        
        // Arquivar categoria antiga
        await supabaseAdmin.from('categories').update({ archived: true, name: `${t.from} [MERGED]` }).eq('id', sourceId);
      }
    } else if (sourceId && !targetId) {
       // Se o destino não existe, apenas renomeia
       console.log(`Destino ${t.to} não existe. Renomeando ${t.from} para ${t.to}`);
       await supabaseAdmin.from('categories').update({ name: t.to }).eq('id', sourceId);
    }
  }

  // 3. Reparar [MERGED] da Leiliane (se houver)
  console.log('\n--- REPARANDO [MERGED] LEILIANE ---');
  const { data: mergedCats } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', '%[MERGED]%');
    
  for (const mc of (mergedCats || [])) {
    const cleanName = mc.name.replace(' [MERGED]', '').trim();
    // Tentar achar o destino lógico (ex: se o nome era "Alimentação Henrique [MERGED]", o destino é "Alimentação Henrique")
    const canonicalId = await getCatId(cleanName);
    
    if (canonicalId && canonicalId !== mc.id) {
       const { data: moved } = await supabaseAdmin.from('receipts').update({ category_id: canonicalId }).eq('category_id', mc.id).select('id');
       if (moved && moved.length > 0) {
          totalMigrated += moved.length;
          console.log(`Reparado [MERGED]: ${mc.name} -> ${cleanName}. Movidos ${moved.length} receipts.`);
       }
    }
  }

  console.log(`\nTOTAL DE RECEIPTS MIGRADOS/CORRIGIDOS: ${totalMigrated}`);
}

unify();
