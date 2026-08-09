
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const holdingProfileId = '2906fc21-93bc-42ad-8ca3-701b94fdb5f6';

  console.log('--- SCANNING FOR NEW CARDS ---');

  const { data: receipts } = await supabase
    .from('receipts')
    .select('description, card_id, profile_id, amount, metadata, date')
    .eq('user_id', userId);

  const cardStats = new Map();

  receipts?.forEach(r => {
    const desc = (r.description || '').toUpperCase();
    let bank = null;
    let brand = 'visa';
    let last4 = null;

    // Pattern matching
    if (desc.includes('SAFRA') || desc.includes('INFINITE')) {
      bank = 'Safra';
    } else if (desc.includes('PORTO') || desc.includes('PORTOBANK')) {
      bank = 'PortoBank';
    } else if (desc.includes('NUBANK')) {
      bank = 'Nubank';
      brand = 'mastercard';
    } else if (desc.includes('ITAU')) {
      bank = 'Itaú';
    } else if (desc.includes('BRADESCO')) {
      bank = 'Bradesco';
    } else if (desc.includes('SANTANDER')) {
      bank = 'Santander';
    }

    // Try to find "FINAL XXXX"
    const finalMatch = desc.match(/FINAL\s*(\d{4})/);
    if (finalMatch) last4 = finalMatch[1];

    if (bank) {
      const key = `${bank}:${brand}:${last4 || 'unknown'}`;
      if (!cardStats.has(key)) {
        cardStats.set(key, { bank, brand, last4, count: 0, total: 0, profiles: new Set() });
      }
      const s = cardStats.get(key);
      s.count++;
      s.total += Number(r.amount || 0);
      s.profiles.add(r.profile_id);
    }
  });

  console.log('Detected Card Patterns:');
  for (const [key, s] of cardStats.entries()) {
    console.log(`- ${key}: ${s.count} txns, total ${s.total}, profiles: ${Array.from(s.profiles).join(',')}`);
  }

  // Final fix: If Holding is selected but only Pessoal cards appear, 
  // we need to ensure the UI filters correctly. 
  // In the DB, Safra and Porto are correctly marked as Pessoal.
  // If they are appearing under Holding, it's a UI bug.

  console.log('--- SCAN COMPLETE ---');
}

run();
