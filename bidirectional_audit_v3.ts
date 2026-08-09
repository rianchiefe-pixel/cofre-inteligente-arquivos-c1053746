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

  // Fetch receipts and categories separately to avoid PostgREST relationship ambiguity
  const { data: dbReceipts, error: rError } = await supabaseAdmin
    .from('receipts')
    .select(`id, payment_date, amount, recipient_name, description, transaction_type, expense_behavior, category_id`)
    .eq('profile_id', PERSONAL_PROFILE_ID)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-01-31');

  if (rError) throw new Error(`DB Error: ${rError.message}`);
  
  const { data: categories, error: cError } = await supabaseAdmin
    .from('categories')
    .select('id, name');
  
  if (cError) throw new Error(`Cat Error: ${cError.message}`);

  const catMap = new Map(categories.map(c => [c.id, c.name]));

  console.log(`Planilha: ${officialJanuary.length} | Banco: ${dbReceipts.length}`);

  const matchedOfficialIndices = new Set<number>();
  const matchedReceiptIds = new Set<string>();

  for (const db of dbReceipts) {
    const dbAmount = db.amount / 100;
    const dbDate = db.payment_date;
    const offIdx = officialJanuary.findIndex((off: any, idx: number) => {
      if (matchedOfficialIndices.has(idx)) return false;
      return Math.abs(dbAmount - Math.abs(parseValue(off.Valor))) < 0.01 && dbDate === parseDate(off.Data);
    });
    if (offIdx !== -1) {
      matchedOfficialIndices.add(offIdx);
      matchedReceiptIds.add(db.id);
    }
  }

  for (const db of dbReceipts) {
    if (matchedReceiptIds.has(db.id)) continue;
    const dbAmount = db.amount / 100;
    const dbName = (db.recipient_name || "").toUpperCase();
    const offIdx = officialJanuary.findIndex((off: any, idx: number) => {
      if (matchedOfficialIndices.has(idx)) return false;
      const nameMatch = dbName.includes((off.Destinatário || "").toUpperCase()) || (off.Destinatário || "").toUpperCase().includes(dbName);
      return Math.abs(dbAmount - Math.abs(parseValue(off.Valor))) < 0.01 && nameMatch;
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
    categoria: catMap.get(r.category_id),
    natureza: r.transaction_type,
    id: r.id
  }));

  const conjuntoB = officialJanuary.filter((_, idx) => !matchedOfficialIndices.has(idx)).map(off => ({
    origem: 'Planilha',
    data: parseDate(off.Data),
    favorecido: off.Destinatário,
    valor: Math.abs(parseValue(off.Valor)),
    categoria: off.Categoria,
    natureza: off.Tipo === 'Investimento' ? 'investimento' : 'despesa'
  }));

  const sum = (l: any[]) => l.reduce((a, i) => { a[i.natureza === 'investimento' ? 'inv' : 'desp'] += i.valor; return a; }, { desp: 0, inv: 0 });
  const b = sum(conjuntoA);
  const p = sum(conjuntoB);

  console.log("\n1. Banco Excl Despesas: R$ " + b.desp.toFixed(2));
  console.log("2. Planilha Excl Despesas: R$ " + p.desp.toFixed(2));
  console.log("3. Diferença Líquida Despesas: R$ " + (b.desp - p.desp).toFixed(2));
  console.log("4. Banco Excl Invest: R$ " + b.inv.toFixed(2));
  console.log("5. Planilha Excl Invest: R$ " + p.inv.toFixed(2));
  console.log("6. Diferença Líquida Invest: R$ " + (b.inv - p.inv).toFixed(2));

  console.log("\n7. CONJUNTO A (BANCO):");
  console.table(conjuntoA);
  console.log("\n8. CONJUNTO B (PLANILHA):");
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
    const m = officialJanuary.find(o => Math.abs(Math.abs(parseValue(o.Valor)) - s.val) < 0.01);
    if (m) console.log(`[OK] ${s.name} (R$ ${s.val}) correspondência: ${m.Destinatário} (${m.Data})`);
    else console.log(`[MISSING] ${s.name} (R$ ${s.val}) não encontrada.`);
  }

  console.log("\n10. DIFERENÇA LÍQUIDA TOTAL: R$ " + ((b.desp + b.inv) - (p.desp + p.inv)).toFixed(2));
}

audit();
