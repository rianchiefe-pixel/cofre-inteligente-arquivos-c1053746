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
    const workbook = xlsx.readFile('/tmp/user-uploads/meu-cofre-categorias-corrigidas-ate-30-04-2026.xlsx');
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

    const excessDespesas = [];
    const excessInvest = [];
    const matches = [];

    // Match logic
    const matchedSpreadsheetIndices = new Set();
    
    // Sort DB receipts by amount descending to find big matches first
    const sortedDB = [...dbReceipts].sort((a, b) => b.amount - a.amount);

    for (const r of sortedDB) {
        let found = false;
        for (let i = 0; i < spreadsheetJan.length; i++) {
            if (matchedSpreadsheetIndices.has(i)) continue;
            const row = spreadsheetJan[i];
            
            const dateMatch = row._parsedDate === r.date;
            const amountMatch = Math.abs((Number(row['Valor']) || 0) - (r.amount || 0)) < 0.01;
            
            if (dateMatch && amountMatch) {
                matchedSpreadsheetIndices.add(i);
                found = true;
                matches.push({ id: r.id, line: row._line, valor: r.amount });
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
                natureza: r.transaction_type === 'investment' ? 'Investimento' : 'Despesa',
                linha_planilha: 'NÃO LOCALIZADO',
                motivo: 'Lançamento exclusivo do banco'
            };
            if (item.natureza === 'Despesa') excessDespesas.push(item);
            else excessInvest.push(item);
        }
    }

    // Identify Leandro in spreadsheet
    const leandroInPlanilha = spreadsheetJan.filter(row => String(row['Favorecido'] || '').includes('TEDROS'));
    const leandroInDB = dbReceipts.filter(r => String(r.recipient || '').includes('TEDROS'));

    console.log(JSON.stringify({
        somaDespesas: parseFloat(excessDespesas.reduce((s, i) => s + i.valor, 0).toFixed(2)),
        somaInvest: parseFloat(excessInvest.reduce((s, i) => s + i.valor, 0).toFixed(2)),
        excessDespesas: excessDespesas.slice(0, 50), // Sample for audit
        excessInvest: excessInvest.slice(0, 50),
        leandroInPlanilha: leandroInPlanilha.map(row => ({
            line: row._line,
            date: row._parsedDate,
            favorecido: row['Favorecido'],
            valor: row['Valor'],
            perfil: row['Perfil'],
            natureza: row['Natureza']
        })),
        leandroInDB: leandroInDB.map(r => ({ id: r.id, date: r.date, valor: r.amount, natureza: r.transaction_type }))
    }, null, 2));
}

run();
