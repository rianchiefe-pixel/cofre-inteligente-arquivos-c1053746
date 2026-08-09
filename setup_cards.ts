import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function setupCards() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profiles = {
    pessoal: 'c44c244d-b05f-47dc-bc58-7056351e7703',
    holding: '2906fc21-93bc-42ad-8ca3-701b94fdb5f6'
  };

  const cardConfigs = [
    {
      name: 'Safra Visa Infinite',
      institution: 'Safra',
      brand: 'visa',
      profile_id: profiles.pessoal,
      holders: [
        { name: 'LEILIANE P D SILVA', last4: '9040', is_primary: true },
        { name: 'GILBERTO V B SOUZA', last4: '9800', is_primary: false }
      ]
    },
    {
      name: 'PortoBank Visa',
      institution: 'PortoBank',
      brand: 'visa',
      profile_id: profiles.pessoal,
      holders: [
        { name: 'LEILIANE P D SILVA', last4: null, is_primary: true }
      ]
    }
  ];

  console.log('--- Initializing Credit Cards ---');

  for (const config of cardConfigs) {
    // 1. Check if Card exists
    let { data: card, error: fetchError } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('user_id', userId)
      .eq('profile_id', config.profile_id)
      .eq('name', config.name)
      .maybeSingle();

    if (!card) {
      const { data: newCard, error: insertError } = await supabaseAdmin
        .from('cards')
        .insert({
          user_id: userId,
          profile_id: config.profile_id,
          name: config.name,
          brand: config.brand as any,
          holder: 'Titular Principal'
        })
        .select()
        .single();
      
      if (insertError) {
        console.error(`Error inserting card ${config.name}:`, insertError);
        continue;
      }
      card = newCard;
    }

    console.log(`Card ensured: ${card.name} (${card.id})`);

    // 2. Holders
    for (const h of config.holders) {
      let { data: holder } = await supabaseAdmin
        .from('card_holders')
        .select('*')
        .eq('card_id', card.id)
        .eq('holder_name', h.name)
        .maybeSingle();

      if (!holder) {
        const { data: newHolder, error: hError } = await supabaseAdmin
          .from('card_holders')
          .insert({
            user_id: userId,
            card_id: card.id,
            holder_name: h.name,
            last4: h.last4,
            is_primary: h.is_primary
          })
          .select()
          .single();

        if (hError) {
          console.error(`  Error inserting holder ${h.name}:`, hError);
          continue;
        }
        holder = newHolder;
      }
      console.log(`  Holder ensured: ${holder.holder_name} | Last4: ${holder.last4}`);
    }

    // 3. Link receipts
    console.log(`  Linking receipts for ${config.institution}...`);
    const { data: receipts } = await supabaseAdmin
        .from('receipts')
        .select('id, bank_name, description, notes, ocr_data')
        .eq('profile_id', config.profile_id)
        .is('card_id', null);

    if (!receipts) continue;

    let linkedCount = 0;
    for (const r of receipts) {
        const text = `${r.bank_name} ${r.description} ${r.notes} ${JSON.stringify(r.ocr_data)}`.toLowerCase();
        if (text.includes(config.institution.toLowerCase())) {
            const { error: updateErr } = await supabaseAdmin
                .from('receipts')
                .update({ card_id: card.id })
                .eq('id', r.id);
            
            if (!updateErr) linkedCount++;
        }
    }
    console.log(`  Linked ${linkedCount} receipts.`);
  }

  console.log('\n--- Done ---');
}

setupCards().catch(console.error);
