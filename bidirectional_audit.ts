import { supabaseAdmin } from './src/integrations/supabase/client.server';
import * as fs from 'fs';

const PERSONAL_PROFILE_ID = 'c44c244d-b05f-47dc-bc58-7056351e7703';

function parseValue(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  // Se o valor parece ser em centavos no banco mas na planilha é float...
  // A instrução diz que "-15,11" -> -15.11 no CSV e no DB guardamos em centavos (-1511)
  return parseFloat(s);
}

function parseDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    // Excel date serial
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
  // 1. Carregar Planilha Oficial (Somente Janeiro)
  const spreadsheetData = JSON.parse(fs.readFileSync('/tmp/january_official.json', 'utf-8'));
  const officialJanuary = spreadsheetData.filter((row: any) => {
    const date = parseDate(row.Data);
    return date && date.startsWith('2026-01') && row.Perfil === 'Pessoal';
  });

  // 2. Carregar Banco (Somente Janeiro/Pessoal)
  const query = supabaseAdmin
    .from('receipts')
    .select(`
      id,
      payment_date,
      amount,
      recipient_name,
      description,
      transaction_type,
      expense_behavior,
      categories ( name )
    `)
    .eq('profile_id', PERSONAL_PROFILE_ID)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-01-31');

  const { data: dbReceipts, error } = await query;

  if (error) {
    throw new Error(`Database error: ${JSON.stringify(error)}`);
  }

  if (!dbReceipts) {
    throw new Error("No receipts returned from DB");
  }

  console.log(`Planilha Oficial (Jan/Pessoal): ${officialJanuary.length} itens`);
  console.log(`Banco (Jan/Pessoal): ${dbReceipts.length} itens`);

  const matchedReceiptIds = new Set<string>();
  const matchedOfficialIndices = new Set<number>();

  const conjuntoA: any[] = []; // Exclusivo Banco
  const conjuntoB: any[] = []; // Exclusivo Planilha

  // Reconciliação Bidirecional
  // Tentativa de match exato (Valor + Data aproximada + Favorecido aproximado)
  
  for (const db of dbReceipts) {
    let found = false;
    const dbDate = db.payment_date;
    const dbAmount = db.amount / 100; // DB está em centavos
    const dbName = (db.recipient_name || "").toUpperCase();

    for (let i = 0; i < officialJanuary.length; i++) {
      if (matchedOfficialIndices.has(i)) continue;
      
      const off = officialJanuary[i];
      const offDate = parseDate(off.Data);
      const offAmount = Math.abs(parseValue(off.Valor));
      const offName = (off.Destinatário || "").toUpperCase();

      // Critério de match: Valor exato + Data igual
      if (Math.abs(dbAmount - offAmount) < 0.01 && dbDate === offDate) {
         // Verificamos nome ou categoria como desempate se necessário, mas valor+data é forte
         matchedOfficialIndices.add(i);
         matchedReceiptIds.add(db.id);
         found = true;
         break;
      }
    }
    
    if (!found) {
      conjuntoA.push({
        origem: 'Banco',
        data: db.payment_date,
        favorecido: db.recipient_name,
        valor: dbAmount,
        categoria: db.categories?.name,
        natureza: db.transaction_type,
        comportamento: db.expense_behavior,
        receipt_id: db.id,
        situacao: 'Não encontrado na planilha'
      });
    }
  }

  for (let i = 0; i < officialJanuary.length; i++) {
    if (matchedOfficialIndices.has(i)) continue;
    const off = officialJanuary[i];
    conjuntoB.push({
      origem: 'Planilha',
      data: parseDate(off.Data),
      favorecido: off.Destinatário,
      valor: Math.abs(parseValue(off.Valor)),
      categoria: off.Categoria,
      natureza: off.Tipo === 'Investimento' ? 'investimento' : 'despesa',
      receipt_id: null,
      situacao: 'Não encontrado no banco'
    });
  }

  // Cálculos de Totais
  const calcTotals = (list: any[]) => {
    return list.reduce((acc, item) => {
      const nat = item.natureza === 'investimento' ? 'inv' : 'desp';
      acc[nat] += item.valor;
      return acc;
    }, { desp: 0, inv: 0 });
  };

  const exclBanco = calcTotals(conjuntoA);
  const exclPlanilha = calcTotals(conjuntoB);

  console.log("\n--- RESULTADOS DA AUDITORIA ---");
  console.log(`1. Total exclusivo do banco - Despesas: R$ ${exclBanco.desp.toFixed(2)}`);
  console.log(`2. Total exclusivo da planilha - Despesas: R$ ${exclPlanilha.desp.toFixed(2)}`);
  console.log(`3. Diferença líquida - Despesas: R$ ${(exclBanco.desp - exclPlanilha.desp).toFixed(2)}`);

  console.log(`\n4. Total exclusivo do banco - Investimentos: R$ ${exclBanco.inv.toFixed(2)}`);
  console.log(`5. Total exclusivo da planilha - Investimentos: R$ ${exclPlanilha.inv.toFixed(2)}`);
  console.log(`6. Diferença líquida - Investimentos: R$ ${(exclBanco.inv - exclPlanilha.inv).toFixed(2)}`);

  console.log("\n7. TABELA CONJUNTO A (Banco Exclusive):");
  console.table(conjuntoA.map(i => ({ Data: i.data, Favorecido: i.favorecido, Valor: i.valor, Natureza: i.natureza, ID: i.receipt_id })));

  console.log("\n8. TABELA CONJUNTO B (Planilha Exclusive):");
  console.table(conjuntoB.map(i => ({ Data: i.data, Favorecido: i.favorecido, Valor: i.valor, Natureza: i.natureza })));

  // Investigação dos 7
  const os7 = [
    { name: "IPVA TAOS", val: 5321.73 },
    { name: "NOVI PISOS", val: 5499.99 },
    { name: "OPERADOR NACIONAL", val: 7105.27 },
    { name: "FORNECEDOR GADO", val: 8000.00 },
    { name: "JOSIAS Marceneiro", val: 13500.00 },
    { name: "JOSÉ BATISTA SOUZA", val: 20000.00 },
    { name: "LEANDRO C TEDROS", val: 54000.00 }
  ];

  console.log("\n9. INVESTIGAÇÃO DOS 7:");
  for (const item of os7) {
    const match = officialJanuary.find((off: any) => Math.abs(Math.abs(parseValue(off.Valor)) - item.val) < 0.01);
    if (match) {
      console.log(`[!] ${item.name} (R$ ${item.val}) POSSUI correspondência na planilha: ${match.Destinatário} | ${match.Data} | ${match.Categoria}`);
    } else {
      console.log(`[ ] ${item.name} (R$ ${item.val}) realmente AUSENTE da planilha.`);
    }
  }

  const diffTotal = (exclBanco.desp + exclBanco.inv) - (exclPlanilha.desp + exclPlanilha.inv);
  console.log(`\n10. CONFIRMAÇÃO MATEMÁTICA: R$ ${diffTotal.toFixed(2)}`);
}

audit();
