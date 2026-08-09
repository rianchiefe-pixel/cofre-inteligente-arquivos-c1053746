import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function analyze() {
  const email = 'advocacia@leilianepereira.com';
  
  // 1. Get User and Profiles
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
  if (userError) throw userError;
  
  const user = userData.users.find(u => u.email === email);
  if (!user) {
    console.log(`User ${email} not found`);
    return;
  }
  
  console.log(`User ID: ${user.id}`);
  
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('financial_profiles')
    .select('id, name, type')
    .eq('user_id', user.id);
  
  if (profileError) throw profileError;
  console.log('Profiles found:', JSON.stringify(profiles, null, 2));
  
  const profileIds = profiles.map(p => p.id);
  
  // 2. Scan Receipts for card-related keywords
  console.log('\nScanning receipts for card patterns...');
  const { data: cardReceipts, error: receiptsError } = await supabaseAdmin
    .from('receipts')
    .select('id, bank_name, description, notes, ocr_data, amount, payment_date, profile_id, card_id')
    .in('profile_id', profileIds);
    
  if (receiptsError) throw receiptsError;
  
  const cardKeywords = ['cartão', 'safra', 'portobank', 'porto seguro', 'infinite', 'visa', 'mastercard', 'final', 'portador', 'fatura'];
  
  const findings = cardReceipts.filter(r => {
    const text = `${r.bank_name} ${r.description} ${r.notes} ${JSON.stringify(r.ocr_data)}`.toLowerCase();
    return cardKeywords.some(kw => text.includes(kw));
  });
  
  console.log(`Analyzed ${cardReceipts.length} receipts.`);
  console.log(`Identified ${findings.length} as potential card transactions.`);
  
  // Group by profile and inferred card name
  const cardsDetected = new Map();
  
  findings.forEach(f => {
    const text = `${f.bank_name} ${f.description} ${f.notes} ${JSON.stringify(f.ocr_data)}`.toLowerCase();
    let cardName = 'Unknown';
    let institution = 'Unknown';
    
    if (text.includes('safra')) {
        institution = 'Safra';
        cardName = 'Safra Visa Infinite';
    } else if (text.includes('porto')) {
        institution = 'PortoBank';
        cardName = 'PortoBank';
    }
    
    const key = `${f.profile_id}|${institution}|${cardName}`;
    if (!cardsDetected.has(key)) {
        cardsDetected.set(key, { 
            profile_id: f.profile_id, 
            institution, 
            cardName, 
            count: 0, 
            amount: 0,
            holders: new Set(),
            last4s: new Set()
        });
    }
    
    const stats = cardsDetected.get(key);
    stats.count++;
    stats.amount += (f.amount || 0);
    
    // Attempt to extract holder and last4 from ocr_data or description
    const ocrStr = JSON.stringify(f.ocr_data).toUpperCase();
    if (ocrStr.includes('LEILIANE')) stats.holders.add('LEILIANE P D SILVA');
    if (ocrStr.includes('GILBERTO')) stats.holders.add('GILBERTO V B SOUZA');
    
    const last4Match = ocrStr.match(/FINAL\s*(\d{4})/);
    if (last4Match) stats.last4s.add(last4Match[1]);
  });
  
  console.log('\nCards Summary:');
  cardsDetected.forEach((v, k) => {
    console.log(`- ${v.institution} (${v.cardName}) | Profile: ${v.profile_id}`);
    console.log(`  Transactions: ${v.count} | Volume: ${v.amount}`);
    console.log(`  Holders: ${Array.from(v.holders).join(', ')}`);
    console.log(`  Last4s: ${Array.from(v.last4s).join(', ')}`);
  });
}

analyze().catch(console.error);
