import { supabaseAdmin as supabase } from './src/integrations/supabase/client.server';

async function runTests() {
  const userId = '54bc0086-d7fb-40b4-9e50-7d1bb05c944e';
  const rowIdA = '3bf49e08-bdc6-4a01-a72c-1c86afb1101b';
  const rowIdC = '0f691295-95e3-4928-9d30-3df7647769e7';
  const rowIdD = '0301c2fc-4b9e-4dd7-bb83-978955221fb7'; 

  console.log('--- TESTE A & B: Aprovação e Idempotência ---');
  const { data: recBefore } = await supabase.from('receipts').select('id').eq('import_row_id', rowIdA);
  console.log('Receipts antes (A):', recBefore?.length || 0);

  const { data: row } = await supabase.from('import_rows').select('*').eq('id', rowIdA).single();
  const payload = {
    user_id: userId,
    import_row_id: rowIdA,
    import_batch_id: row.batch_id,
    amount: Math.abs(row.amount),
    payment_date: row.transaction_date,
    recipient_name: row.payee || row.description,
    transaction_type: 'despesa',
    payment_method: 'outro',
    status: 'approved'
  };
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('approve_import_row_rpc', {
    p_row_id: rowIdA,
    p_receipt_payload: payload
  });
  console.log('RPC Result (A):', rpcRes, rpcErr?.message);

  const { data: recAfter } = await supabase.from('receipts').select('id, amount').eq('import_row_id', rowIdA);
  console.log('Receipts depois (A):', recAfter?.length);
  const { data: rowAfter } = await supabase.from('import_rows').select('review_status').eq('id', rowIdA).single();
  console.log('Status linha (A):', rowAfter?.review_status);

  console.log('--- TESTE B: Idempotência ---');
  await supabase.rpc('approve_import_row_rpc', {
    p_row_id: rowIdA,
    p_receipt_payload: payload
  });
  const { data: recB } = await supabase.from('receipts').select('id').eq('import_row_id', rowIdA);
  console.log('Count B:', recB?.length);
  console.log('ID preservado:', recB?.[0]?.id === recAfter?.[0]?.id);

  console.log('--- TESTE C: Ver Depois ---');
  await supabase.from('import_rows').update({ review_status: 'ver_depois', reviewed_at: new Date().toISOString() }).eq('id', rowIdC);
  const { data: rowC } = await supabase.from('import_rows').select('review_status').eq('id', rowIdC).single();
  const { data: recC } = await supabase.from('receipts').select('id').eq('import_row_id', rowIdC);
  console.log('Status C:', rowC?.review_status);
  console.log('Receipts C:', recC?.length || 0);

  console.log('--- TESTE E: Falha Transacional ---');
  const payloadE = { ...payload, transaction_type: 'INVALIDO', import_row_id: rowIdD };
  const { error: errorE } = await supabase.rpc('approve_import_row_rpc', {
    p_row_id: rowIdD,
    p_receipt_payload: payloadE
  });
  console.log('Erro E (esperado):', errorE?.message);
  const { data: rowE } = await supabase.from('import_rows').select('review_status').eq('id', rowIdD).single();
  console.log('Status E (pendente):', rowE?.review_status);
}

runTests();
