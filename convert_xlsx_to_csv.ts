import * as XLSX from 'xlsx';
import * as fs from 'fs';

async function run() {
  const filePath = '/mnt/user-uploads/meu-cofre-categorias-corrigidas-ate-30-04-2026.xlsx';
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Usar raw: true para manter os valores originais, especialmente para datas e números
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  fs.writeFileSync('/tmp/meu-cofre-categorias-corrigidas-ate-30-04-2026.csv', csv);
  console.log('CSV gerado em /tmp/meu-cofre-categorias-corrigidas-ate-30-04-2026.csv');
  
  // Mostrar as primeiras linhas para validação
  console.log('Primeiras 5 linhas do CSV:');
  console.log(csv.split('\n').slice(0, 5).join('\n'));
}

run();
