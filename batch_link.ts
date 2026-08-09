import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function updateBatchReceipts() {
    const safraCardId = '56f00738-9652-41f8-985e-2a91304d041b';
    const portoCardId = 'b6520914-010b-44e7-a2b5-589be2e5ac77';
    const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

    console.log('--- Batch Linking Receipts ---');

    // Linking Safra receipts where bank_name or description contains 'safra'
    const { error: safraErr } = await supabaseAdmin
        .from('receipts')
        .update({ card_id: safraCardId })
        .eq('profile_id', profileId)
        .or('bank_name.ilike.%safra%,description.ilike.%safra%,notes.ilike.%safra%');
    
    if (safraErr) console.error('Error linking Safra:', safraErr);
    else console.log('Safra linking complete.');

    // Linking Porto receipts
    const { error: portoErr } = await supabaseAdmin
        .from('receipts')
        .update({ card_id: portoCardId })
        .eq('profile_id', profileId)
        .or('bank_name.ilike.%porto%,description.ilike.%porto%,notes.ilike.%porto%');
    
    if (portoErr) console.error('Error linking Porto:', portoErr);
    else console.log('Porto linking complete.');

    console.log('--- Done ---');
}

updateBatchReceipts().catch(console.error);
