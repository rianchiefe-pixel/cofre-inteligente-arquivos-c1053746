import { supabaseAdmin } from './src/integrations/supabase/client.server';
import * as fs from 'fs';

const PERSONAL_PROFILE_ID = 'c44c244d-b05f-47dc-bc58-7056351e7703';

function parseValue(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  return parseFloat(s);
}

function parseDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  const match = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return s;
}

async function audit() {
  const spreadsheetData = JSON.parse(fs.readFileSync('/tmp/january_official.json', 'utf-8'));
  const officialJanuary = spreadsheetData.filter((row: any) => {
    const date = parseDate(row.Data);
    return date && date.startsWith('2026-01') && row.Perfil === 'Pessoal';
  });

  const { data: dbReceipts, error } = await supabaseAdmin
    .from('receipts')
    .select(`
      id,
      payment_date,
      amount,
      recipient_name,
      description,
      transaction_type,
      expense_behavior,
      category_id
    `)
    .eq('profile_id', PERSONAL_PROFILE_ID)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-01-31');

  if (error) throw new Error(`DB Error: ${error.message}`);
  if (!dbReceipts) throw new Error("No data");

  console.log(`Planilha: ${officialJanuary.length} | Banco: ${dbReceipts.length}`);

  const matchedOfficialIndices = new Set<number>();
  const matchedReceiptIds = new Set<string>();

  // Primeiro pass: Matches exatos por Valor e Data
  for (const db of dbReceipts) {
    const dbAmount = db.amount / 100;
    const dbDate = db.payment_date;
    
    const offIdx = officialJanuary.findIndex((off: any, idx: number) => {
      if (matchedOfficialIndices.has(idx)) return false;
      const offVal = Math.abs(parseValue(off.Valor));
      const offDate = parseDate(off.Data);
      return Math.abs(dbAmount - offVal) < 0.01 && dbDate === offDate;
    });

    if (offIdx !== -1) {
      matchedOfficialIndices.add(offIdx);
      matchedReceiptIds.add(db.id);
    }
  }

  // Segundo pass: Matches por valor e nome (se a data variar 1-2 dias)
  for (const db of dbReceipts) {
    if (matchedReceiptIds.has(db.id)) continue;
    const dbAmount = db.amount / 100;
    const dbName = (db.recipient_name || "").toUpperCase();

    const offIdx = officialJanuary.findIndex((off: any, idx: number) => {
      if (matchedOfficialIndices.has(idx)) return false;
      const offVal = Math.abs(parseValue(off.Valor));
      const offName = (off.Destinatário || "").toUpperCase();
      
      // Match de valor e o nome está contido um no outro
      const nameMatch = dbName.includes(offName) || offName.includes(dbName) || (dbName.slice(0, 5) === offName.slice(0, 5) && dbName.length > 3);
      
      return Math.abs(dbAmount - offVal) < 0.01 && nameMatch;
    });

    if (offIdx !== -1) {
      matchedOfficialIndices.add(offIdx);
      matchedReceiptIds.add(db.id);
    }
  }

  const conjuntoA = dbReceipts.filter(r => !matchedReceiptIds.has(r.id)).map(r => ({
    origem: 'Banco',
    data: r.payment_date,
    favorecido: r.recipient_name,
    valor: r.amount / 100,
    categoria: r.categories?.name,
    natureza: r.transaction_type,
    receipt_id: r.id
  }));

  const conjuntoB = officialJanuary.filter((_, idx) => !matchedOfficialIndices.has(idx)).map(off => ({
    origem: 'Planilha',
    data: parseDate(off.Data),
    favorecido: off.Destinatário,
    valor: Math.abs(parseValue(off.Valor)),
    categoria: off.Categoria,
    natureza: off.Tipo === 'Investimento' ? 'investimento' : 'despesa'
  }));

  const sumByNature = (list: any[]) => list.reduce((acc, item) => {
    const key = item.natureza === 'investimento' ? 'inv' : 'desp';
    acc[key] += item.valor;
    return acc;
  }, { desp: 0, inv: 0 });

  const exclBanco = sumByNature(conjuntoA);
  const exclPlanilha = sumByNature(conjuntoB);

  console.log("\n--- RESULTADOS ---");
  console.log(`1. Banco Exclusivo Despesas: R$ ${exclBanco.desp.toFixed(2)}`);
  console.log(`2. Planilha Exclusiva Despesas: R$ ${exclPlanilha.desp.toFixed(2)}`);
  console.log(`3. Diferença Líquida Despesas: R$ ${(exclBanco.desp - exclPlanilha.desp).toFixed(2)}`);
  console.log(`4. Banco Exclusivo Invest: R$ ${exclBanco.inv.toFixed(2)}`);
  console.log(`5. Planilha Exclusiva Invest: R$ ${exclPlanilha.inv.toFixed(2)}`);
  console.log(`6. Diferença Líquida Invest: R$ ${(exclBanco.inv - exclPlanilha.inv).toFixed(2)}`);

  console.log("\n7. CONJUNTO A (Banco):");
  console.table(conjuntoA);

  console.log("\n8. CONJUNTO B (Planilha):");
  console.table(conjuntoB);

  console.log("\n9. INVESTIGAÇÃO DOS 7:");
  const os7 = [
    { name: "IPVA TAOS", val: 5321.73 },
    { name: "NOVI PISOS", val: 5499.99 },
    { name: "OPERADOR NACIONAL", val: 7105.27 },
    { name: "FORNECEDOR GADO", val: 8000.00 },
    { name: "JOSIAS Marceneiro", val: 13500.00 },
    { name: "JOSÉ BATISTA SOUZA", val: 20000.00 },
    { name: "LEANDRO C TEDROS", val: 54000.00 }
  ];
  for (const s of os7) {
    const match = officialJanuary.find(o => Math.abs(Math.abs(parseValue(o.Valor)) - s.val) < 0.01);
    if (match) {
      console.log(`[OK] ${s.name} (R$ ${s.val}) correspondência na planilha: ${match.Destinatário} (${match.Data})`);
    } else {
      console.log(`[MISSING] ${s.name} (R$ ${s.val}) não encontrada.`);
    }
  }

  console.log(`\n10. DIFERENÇA LÍQUIDA TOTAL: R$ ${((exclBanco.desp + exclBanco.inv) - (exclPlanilha.desp + exclPlanilha.inv)).toFixed(2)}`);
}

audit();
