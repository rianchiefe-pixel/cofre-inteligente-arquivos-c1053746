import { supabaseAdmin } from './src/integrations/supabase/client.server';
import * as fs from 'fs';

const PERSONAL_PROFILE_ID = 'c44c244d-b05f-47dc-bc58-7056351e7703';

function parseValue(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  let num = parseFloat(s);
  // Se o número for muito pequeno (ex: 0.1), provavelmente é um erro de escala da planilha
  // Mas na auditoria anterior o banco tinha "0.2" para o que deveria ser R$ 20,00.
  // Vamos assumir que se o valor na planilha > 1 e no banco é valor/100, precisamos multiplicar o banco.
  return num;
}

function parseDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  const match = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return s;
}

async function audit() {
  const spreadsheetData = JSON.parse(fs.readFileSync('/tmp/january_official.json', 'utf-8'));
  const officialJanuary = spreadsheetData.filter((row: any) => {
    const date = parseDate(row.Data);
    return date && date.startsWith('2026-01') && row.Perfil === 'Pessoal';
  });

  const { data: dbReceipts, error: rError } = await supabaseAdmin
    .from('receipts')
    .select(`id, payment_date, amount, recipient_name, description, transaction_type, expense_behavior, category_id`)
    .eq('profile_id', PERSONAL_PROFILE_ID)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-01-31');

  if (rError) throw new Error(`DB Error: ${rError.message}`);
  
  const { data: categories } = await supabaseAdmin.from('categories').select('id, name');
  const catMap = new Map((categories || []).map(c => [c.id, c.name]));

  const matchedOfficialIndices = new Set<number>();
  const matchedReceiptIds = new Set<string>();

  // Pass 1: Matches exatos por Valor e Data
  for (const db of dbReceipts) {
    const dbAmount = db.amount / 100;
    const dbDate = db.payment_date;
    const offIdx = officialJanuary.findIndex((off: any, idx: number) => {
      if (matchedOfficialIndices.has(idx)) return false;
      const offVal = Math.abs(parseValue(off.Valor));
      // Aceita diferença de centavos
      return Math.abs(dbAmount - offVal) < 0.1 && dbDate === parseDate(off.Data);
    });
    if (offIdx !== -1) {
      matchedOfficialIndices.add(offIdx);
      matchedReceiptIds.add(db.id);
    }
  }

  // Pass 2: Matches por Valor e Nome (Data pode variar)
  for (const db of dbReceipts) {
    if (matchedReceiptIds.has(db.id)) continue;
    const dbAmount = db.amount / 100;
    const dbName = (db.recipient_name || "").toUpperCase();
    const offIdx = officialJanuary.findIndex((off: any, idx: number) => {
      if (matchedOfficialIndices.has(idx)) return false;
      const offVal = Math.abs(parseValue(off.Valor));
      const offName = (off.Destinatário || "").toUpperCase();
      const nameMatch = dbName.includes(offName) || offName.includes(dbName);
      return Math.abs(dbAmount - offVal) < 0.1 && nameMatch;
    });
    if (offIdx !== -1) {
      matchedOfficialIndices.add(offIdx);
      matchedReceiptIds.add(db.id);
    }
  }

  // Pass 3: Matches por Valor (Escalado - Tratando erro de importação de centavos)
  for (const db of dbReceipts) {
    if (matchedReceiptIds.has(db.id)) continue;
    // Tenta ver se db.amount (em centavos) corresponde ao valor em Reais da planilha
    // Ex: db.amount = 3996 (que o sistema exibe como R$ 39,96) corresponde a R$ 3996,00 na planilha
    const dbAmountOriginal = db.amount; 
    const dbDate = db.payment_date;
    const offIdx = officialJanuary.findIndex((off: any, idx: number) => {
      if (matchedOfficialIndices.has(idx)) return false;
      const offVal = Math.abs(parseValue(off.Valor));
      return Math.abs(dbAmountOriginal - offVal) < 0.1 && dbDate === parseDate(off.Data);
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

  console.log("\n--- RESULTADOS AUDITORIA BIDIRECIONAL JANEIRO ---");
  console.log(`1. Banco Excl Despesas: R$ ${b.desp.toFixed(2)}`);
  console.log(`2. Planilha Excl Despesas: R$ ${p.desp.toFixed(2)}`);
  console.log(`3. Diferença Líquida Despesas: R$ ${(b.desp - p.desp).toFixed(2)}`);
  console.log(`4. Banco Excl Invest: R$ ${b.inv.toFixed(2)}`);
  console.log(`5. Planilha Excl Invest: R$ ${p.inv.toFixed(2)}`);
  console.log(`6. Diferença Líquida Invest: R$ ${(b.inv - p.inv).toFixed(2)}`);

  console.log("\n7. CONJUNTO A (BANCO EXCLUSIVO):");
  console.table(conjuntoA);
  console.log("\n8. CONJUNTO B (PLANILHA EXCLUSIVA):");
  console.table(conjuntoB);

  console.log("\n9. INVESTIGAÇÃO DOS 7 RECEIPTS ANTERIORES:");
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
    const m = officialJanuary.find(o => Math.abs(Math.abs(parseValue(o.Valor)) - s.val) < 1.0);
    if (m) console.log(`[OK] ${s.name} (R$ ${s.val}) possui correspondência na planilha: ${m.Destinatário} (${m.Data})`);
    else console.log(`[MISSING] ${s.name} (R$ ${s.val}) não encontrada na planilha oficial.`);
  }

  const diffTotal = (b.desp + b.inv) - (p.desp + p.inv);
  console.log(`\n10. CONFIRMAÇÃO MATEMÁTICA (Líquida): R$ ${diffTotal.toFixed(2)}`);
}

audit();
