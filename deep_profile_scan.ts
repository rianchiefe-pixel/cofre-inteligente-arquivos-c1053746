import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function scan() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  
  const { data: profiles } = await supabaseAdmin
    .from('financial_profiles')
    .select('*')
    .eq('user_id', userId);

  console.log('--- SCAN DE PERFIS ---');
  for (const p of (profiles || [])) {
    const { data: cats } = await supabaseAdmin.from('categories').select('id, name').eq('profile_id', p.id);
    const { count: receipts } = await supabaseAdmin.from('receipts').select('*', { count: 'exact', head: true }).eq('profile_id', p.id);
    
    console.log(`Perfil: ${p.name} (${p.id})`);
    console.log(`Receipts: ${receipts}`);
    console.log(`Categories count: ${cats?.length}`);
    
    const targets = ['Carro', 'Sala Comercial Leila', 'Casa 26', 'Diarista', 'Educação', 'Farmácia', 'Pensão Alimentícia - Erick'];
    const found = cats?.filter(c => targets.includes(c.name)).map(c => c.name);
    console.log(`Match: ${found?.join(', ') || 'Nenhum'}`);
    
    if (found && found.includes('Carro')) {
        const carroId = cats?.find(c => c.name === 'Carro')?.id;
        const { data: totalData } = await supabaseAdmin.from('receipts').select('amount_centavos').eq('category_id', carroId);
        const total = totalData?.reduce((acc, curr) => acc + (curr.amount_centavos || 0), 0) || 0;
        console.log(`Total Carro: R$ ${(total/100).toLocaleString('pt-BR')}`);
    }
    console.log('---');
  }
}

scan();
