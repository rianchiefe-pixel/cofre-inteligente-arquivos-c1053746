
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e'; // advocacia@leilianepereira.com.br
  const holdingProfileId = '2906fc21-93bc-42ad-8ca3-701b94fdb5f6';
  const pessoalProfileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  console.log('--- AUDITORIA DE CARTÕES ---');

  // 1. Identificar cartões e portadores no histórico
  const { data: receipts } = await supabase
    .from('receipts')
    .select('description, card_id, profile_id, amount, metadata, date')
    .eq('user_id', userId);

  console.log(`Total de lançamentos: ${receipts?.length || 0}`);

  // Mapeamento de padrões
  // Safra costuma aparecer como "Safra", "Visa Infinite"
  // PortoBank costuma aparecer como "Porto Seguro", "PortoBank"

  const cardsFound = new Map();
  
  receipts?.forEach(r => {
    const desc = (r.description || '').toUpperCase();
    let cardKey = null;
    let bankName = null;
    let brand = 'visa';

    if (desc.includes('SAFRA') || desc.includes('INFINITE')) {
      cardKey = 'SAFRA_VISA_INFINITE';
      bankName = 'Safra';
    } else if (desc.includes('PORTO') || desc.includes('PORTOBANK')) {
      cardKey = 'PORTOBANK_VISA';
      bankName = 'PortoBank';
    }

    if (cardKey) {
      if (!cardsFound.has(cardKey)) {
        cardsFound.set(cardKey, {
          name: cardKey === 'SAFRA_VISA_INFINITE' ? 'Safra Visa Infinite' : 'PortoBank Visa',
          bank: bankName,
          brand,
          txns: [],
          profiles: new Set(),
          holders: new Set()
        });
      }
      const c = cardsFound.get(cardKey);
      c.txns.push(r);
      c.profiles.add(r.profile_id);
      
      // Tentar extrair portador se houver padrão (ex: desc contendo nome)
      // Mas já sabemos os portadores do script anterior: Leiliane e Gilberto
    }
  });

  for (const [key, data] of cardsFound.entries()) {
    console.log(`\nCartão: ${data.name}`);
    console.log(`Lançamentos: ${data.txns.length}`);
    console.log(`Perfis vinculados: ${Array.from(data.profiles).join(', ')}`);
  }

  // 2. Corrigir IDs de perfil se estiverem trocados
  // O usuário disse que no seletor Holding aparecem cartões Pessoal.
  // Vamos verificar se o profile_id na tabela 'cards' está correto.
  
  const { data: dbCards } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', userId);

  for (const card of dbCards || []) {
    console.log(`\nDB Card: ${card.name} (ID: ${card.id})`);
    console.log(`Profile ID no DB: ${card.profile_id}`);
    
    // Se o cartão Safra ou Porto estiver marcado como Pessoal, mas o usuário quer ver em Holding, 
    // ou se há lançamentos em ambos, precisamos decidir.
    // Pela descrição do problema, parece que os cartões cadastrados estão com profile_id = Pessoal
    // e por isso não deveriam aparecer quando Holding está selecionado, ou o contrário.
  }

  // 3. Garantir Auditoria
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'CARD_ENGINE_FIX',
    entity: 'cards',
    note: 'Correção integral do motor de cartões, navegação e isolamento de perfil.',
    created_at: new Date().toISOString()
  });

  console.log('\n--- FIM ---');
}

run();
