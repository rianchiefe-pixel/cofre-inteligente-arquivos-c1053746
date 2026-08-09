import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function analyze() {
  // Let's find all users to see the exact email or ID
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
  if (userError) throw userError;
  
  console.log('Available users:');
  userData.users.forEach(u => console.log(`- ${u.email} (${u.id})`));

  const targetEmail = 'advocacia@leilianepereira.com';
  // Try to find by email (exact or partial)
  const user = userData.users.find(u => u.email?.toLowerCase().includes('advocacia@leilianepereira.com'));
  
  if (!user) {
    console.log(`\nUser matching "${targetEmail}" NOT FOUND.`);
    return;
  }
  
  console.log(`\nFound User: ${user.email} (${user.id})`);
  
  // 1. Profiles
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('financial_profiles')
    .select('id, name, type')
    .eq('user_id', user.id);
  
  if (profileError) throw profileError;
  console.log('\nProfiles:', JSON.stringify(profiles, null, 2));
  const profileIds = profiles.map(p => p.id);

  // 2. Comprehensive Scan of receipts
  console.log('\nScanning ALL receipts for this user...');
  const { data: receipts, error: receiptsError } = await supabaseAdmin
    .from('receipts')
    .select('*')
    .in('profile_id', profileIds);
    
  if (receiptsError) throw receiptsError;
  console.log(`Total receipts found: ${receipts.length}`);

  const cardKeywords = ['cartão', 'safra', 'porto', 'infinite', 'visa', 'mastercard', 'final', 'portador', 'fatura', 'credit', 'crédito'];
  
  const matches = receipts.filter(r => {
    const text = `${r.bank_name} ${r.description} ${r.notes} ${JSON.stringify(r.ocr_data)} ${r.payment_method}`.toLowerCase();
    return cardKeywords.some(kw => text.includes(kw)) || r.payment_method?.includes('credito');
  });

  console.log(`Matches identified as card related: ${matches.length}`);

  const analysis = {
    profiles: profiles.map(p => ({ id: p.id, name: p.name })),
    cards: {},
    consolidations: []
  };

  matches.forEach(r => {
    const text = `${r.bank_name} ${r.description} ${r.notes} ${JSON.stringify(r.ocr_data)}`.toLowerCase();
    let institution = 'Outro';
    let brand = 'outro';
    
    if (text.includes('safra')) institution = 'Safra';
    else if (text.includes('porto')) institution = 'PortoBank';
    
    if (text.includes('visa')) brand = 'visa';
    else if (text.includes('mastercard')) brand = 'mastercard';

    const cardName = institution === 'Safra' ? 'Safra Visa Infinite' : (institution === 'PortoBank' ? 'PortoBank Visa' : institution);
    const cardKey = `${r.profile_id}|${institution}|${cardName}`;

    if (!analysis.cards[cardKey]) {
      analysis.cards[cardKey] = {
        profile_id: r.profile_id,
        institution,
        name: cardName,
        brand,
        holders: {},
        txCount: 0,
        totalAmount: 0
      };
    }

    const card = analysis.cards[cardKey];
    card.txCount++;
    card.totalAmount += (r.amount || 0);

    // Extract Holder and Last4
    let holderName = 'Não identificado';
    let last4 = null;

    const ocrStr = JSON.stringify(r.ocr_data).toUpperCase();
    if (ocrStr.includes('LEILIANE')) holderName = 'LEILIANE P D SILVA';
    else if (ocrStr.includes('GILBERTO')) holderName = 'GILBERTO V B SOUZA';
    
    const last4Match = ocrStr.match(/FINAL\s*(\d{4})/) || text.toUpperCase().match(/FINAL\s*(\d{4})/);
    if (last4Match) last4 = last4Match[1];

    const holderKey = `${holderName}|${last4 || 'none'}`;
    if (!card.holders[holderKey]) {
      card.holders[holderKey] = { name: holderName, last4, count: 0, amount: 0 };
    }
    card.holders[holderKey].count++;
    card.holders[holderKey].amount += (r.amount || 0);
  });

  console.log('\n--- FINAL ANALYSIS REPORT ---');
  console.log(JSON.stringify(analysis, null, 2));
}

analyze().catch(console.error);
