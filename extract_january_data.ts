import * as XLSX from 'xlsx';
import * as fs from 'fs';

async function run() {
  const filePath = '/mnt/user-uploads/meu-cofre-categorias-corrigidas-ate-30-04-2026.xlsx';
  const workbook = XLSX.readFile(filePath);
  
  // Listar todas as abas
  console.log('Abas disponíveis:', workbook.SheetNames);
  
  // Vamos focar na aba que contém dados de Janeiro
  // Geralmente é a primeira ou tem "Jan" no nome
  const sheetName = workbook.SheetNames.find(n => n.includes('Jan')) || workbook.SheetNames[0];
  console.log(`Usando aba: ${sheetName}`);
  
  const worksheet = workbook.Sheets[sheetName];
  
  // Exportar como JSON para facilitar o processamento
  const data = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });
  fs.writeFileSync('/tmp/january_official.json', JSON.stringify(data, null, 2));
  
  console.log(`Total de linhas na planilha oficial: ${data.length}`);
  console.log('Exemplo da primeira linha:', JSON.stringify(data[0], null, 2));
}

run();
