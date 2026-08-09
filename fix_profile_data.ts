import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function validateAndFix() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703'; // Perfil Pessoal da Leiliane
  
  console.log('--- VALIDANDO PERFIL LEILIANE ---');
  
  // No banco as categorias estão sem profile_id (provavelmente por um erro de migração anterior)
  // Vamos buscar as categorias vinculadas ao user_id da Leiliane
  const { data: cats, error: catError } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('user_id', userId);

  if (catError) {
    console.error('Erro ao buscar categorias:', catError);
    return;
  }

  console.log(`Categorias encontradas para o usuário: ${cats?.length}`);
  
  const validationNames = ['Carro', 'Sala Comercial Leila', 'Casa 26', 'Diarista', 'Educação', 'Farmácia', 'Pensão Alimentícia - Erick'];
  const matched = cats?.filter(c => validationNames.includes(c.name)).map(c => c.name);
  console.log('Categorias de validação presentes:', matched?.join(', '));

  // Verificar se as categorias estão vinculadas ao profile_id correto
  const misaligned = cats?.filter(c => c.profile_id !== profileId);
  if (misaligned && misaligned.length > 0) {
    console.log(`Atenção: ${misaligned.length} categorias não estão vinculadas ao profile_id ${profileId}.`);
    // Corrigindo o profile_id das categorias
    const { error: updateError } = await supabaseAdmin
      .from('categories')
      .update({ profile_id: profileId })
      .eq('user_id', userId);
    
    if (updateError) console.error('Erro ao corrigir profile_id das categorias:', updateError);
    else console.log('Profile_id das categorias corrigido.');
  }

  // Agora vamos calcular o valor da categoria "Carro"
  const carroCat = cats?.find(c => c.name === 'Carro');
  if (carroCat) {
    const { data: receipts } = await supabaseAdmin
      .from('receipts')
      .select('amount_centavos')
      .eq('category_id', carroCat.id);
    
    const total = receipts?.reduce((acc, r) => acc + (r.amount_centavos || 0), 0) || 0;
    console.log(`Categoria "Carro": ${receipts?.length} lançamentos | Total: R$ ${(total/100).toLocaleString('pt-BR')}`);
  }

  // Sala Comercial Leila
  const salaCat = cats?.find(c => c.name === 'Sala Comercial Leila');
  if (salaCat) {
    const { data: receipts } = await supabaseAdmin
      .from('receipts')
      .select('amount_centavos')
      .eq('category_id', salaCat.id);
    
    const total = receipts?.reduce((acc, r) => acc + (r.amount_centavos || 0), 0) || 0;
    console.log(`Categoria "Sala Comercial Leila": ${receipts?.length} lançamentos | Total: R$ ${(total/100).toLocaleString('pt-BR')}`);
  }
}

validateAndFix();
