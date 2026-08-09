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
    // 1. Upsert Card
    const { data: card, error: cardError } = await supabaseAdmin
      .from('cards')
      .upsert({
        user_id: userId,
        profile_id: config.profile_id,
        name: config.name,
        bank_id: null, // Could link to a bank record if exists, but name is enough for now
        brand: config.brand,
        last4: null // The account doesn't have a single last4, portadores do
      }, { onConflict: 'user_id,profile_id,name' })
      .select()
      .single();

    if (cardError) {
      console.error(`Error upserting card ${config.name}:`, cardError);
      continue;
    }

    console.log(`Card ensured: ${card.name} (${card.id})`);

    // 2. Upsert Holders
    for (const h of config.holders) {
      const { data: holder, error: hError } = await supabaseAdmin
        .from('card_holders')
        .upsert({
          user_id: userId,
          card_id: card.id,
          name: h.name,
          last4: h.last4,
          is_primary: h.is_primary
        }, { onConflict: 'card_id,name,last4' })
        .select()
        .single();

      if (hError) {
        console.error(`Error upserting holder ${h.name}:`, hError);
        continue;
      }
      console.log(`  Holder ensured: ${holder.name} | Last4: ${holder.last4}`);
    }

    // 3. Link existing receipts
    console.log(`  Linking receipts for ${config.institution}...`);
    
    // Fetch card and holders for linking
    const { data: holders } = await supabaseAdmin
        .from('card_holders')
        .select('*')
        .eq('card_id', card.id);

    const { data: receipts } = await supabaseAdmin
        .from('receipts')
        .select('*')
        .eq('profile_id', config.profile_id)
        .is('card_id', null); // Only link if not linked

    if (!receipts) continue;

    let linkedCount = 0;
    for (const r of receipts) {
        const text = `${r.bank_name} ${r.description} ${r.notes} ${JSON.stringify(r.ocr_data)}`.toLowerCase();
        if (text.includes(config.institution.toLowerCase())) {
            let matchedHolderId = null;
            
            // Try matching holder by last4 or name in OCR
            for (const h of holders!) {
                if (h.last4 && text.includes(h.last4)) {
                    matchedHolderId = h.id;
                    break;
                }
                if (text.includes(h.name.toLowerCase().split(' ')[0])) {
                    matchedHolderId = h.id;
                }
            }

            const { error: updateErr } = await supabaseAdmin
                .from('receipts')
                .update({ 
                    card_id: card.id,
                    // We don't have a card_holder_id column in receipts yet, 
                    // we'll need to check the schema or use notes/metadata if needed.
                    // Wait, looking at receipts schema again...
                    // receipts: card_id is present. card_holder_id is NOT in receipts table.
                    // But card_transactions HAS card_holder_id.
                    // The user wants to see portadores in the history.
                })
                .eq('id', r.id);
            
            if (!updateErr) linkedCount++;
        }
    }
    console.log(`  Linked ${linkedCount} receipts to card.`);
  }

  // Record in Audit Logs
  await supabaseAdmin.from('audit_logs').insert({
    user_id: userId,
    action: 'CREATE_CARDS_STRUCTURE',
    entity: 'cards',
    note: 'Identificação e estruturação automática de cartões e portadores a partir do histórico.'
  });
}

setupCards().catch(console.error);
