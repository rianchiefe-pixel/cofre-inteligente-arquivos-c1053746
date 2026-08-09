const fs = require('fs');
const xlsx = require('xlsx');

function parseBRDate(raw) {
    if (!raw) return null;
    if (typeof raw === 'number') {
        const utcMs = Math.round((raw - 25569 + 2) * 86400 * 1000);
        const date = new Date(utcMs);
        return date.toISOString().split('T')[0];
    }
    const s = String(raw).trim();
    const match = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (match) {
        const d = match[1].padStart(2, '0');
        const m = match[2].padStart(2, '0');
        let y = match[3];
        if (y.length === 2) y = '20' + y;
        return `${y}-${m}-${d}`;
    }
    return null;
}

async function run() {
    const workbook = xlsx.readFile('meu-cofre-categorias-corrigidas-ate-30-04-2026.xlsx');
    const sheetName = 'Meu Cofre Corrigido';
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { raw: true });

    const dbReceipts = JSON.parse(fs.readFileSync('/tmp/jan_receipts.json', 'utf8') || '[]');

    const spreadsheetJan = data.map((row, index) => ({
        ...row,
        _line: index + 2,
        _parsedDate: parseBRDate(row['Data'])
    })).filter(row => {
        const isJan = row._parsedDate && row._parsedDate.startsWith('2026-01');
        const perfil = String(row['Perfil'] || '').toLowerCase();
        const isPessoal = perfil.includes('pessoal') || perfil.includes('leiliane');
        return isJan && isPessoal;
    });

    const officialDespesas = 72794.70;
    const officialInvest = 129734.89;
    const officialTotal = 202529.59;

    const excessDespesas = [];
    const excessInvest = [];

    // Match logic
    const matchedSpreadsheetIndices = new Set();
    
    for (const r of dbReceipts) {
        let found = false;
        for (let i = 0; i < spreadsheetJan.length; i++) {
            if (matchedSpreadsheetIndices.has(i)) continue;
            const row = spreadsheetJan[i];
            
            const dateMatch = row._parsedDate === r.date;
            const amountMatch = Math.abs((Number(row['Valor']) || 0) - (r.amount || 0)) < 0.01;
            
            if (dateMatch && amountMatch) {
                matchedSpreadsheetIndices.add(i);
                found = true;
                r._matched_line = row._line;
                break;
            }
        }

        if (!found) {
            const item = {
                receipt_id: r.id,
                data: r.date,
                favorecido: r.recipient,
                valor: r.amount,
                categoria: r.category_id,
                profile_id: r.profile_id,
                natureza: r.transaction_type === 'investment' ? 'Investimento' : 'Despesa',
                linha_planilha: 'NÃO LOCALIZADO',
                comparacao: 'Não consta na planilha base',
                motivo: 'Lançamento exclusivo do banco'
            };
            if (item.natureza === 'Despesa') excessDespesas.push(item);
            else excessInvest.push(item);
        }
    }

    const leandroInPlanilha = spreadsheetJan.find(row => String(row['Favorecido'] || '').includes('TEDROS'));
    const leandroInDB = dbReceipts.filter(r => String(r.recipient || '').includes('TEDROS'));

    console.log(JSON.stringify({
        excessDespesas,
        excessInvest,
        somaDespesas: excessDespesas.reduce((s, i) => s + i.valor, 0),
        somaInvest: excessInvest.reduce((s, i) => s + i.valor, 0),
        leandroInPlanilha: leandroInPlanilha ? {
            line: leandroInPlanilha._line,
            date: leandroInPlanilha._parsedDate,
            favorecido: leandroInPlanilha['Favorecido'],
            valor: leandroInPlanilha['Valor'],
            perfil: leandroInPlanilha['Perfil']
        } : null,
        leandroInDB: leandroInDB.map(r => ({ id: r.id, date: r.date, valor: r.amount }))
    }, null, 2));
}

run();
