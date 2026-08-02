import { isDemoEmail, LEGACY_DEMO_EMAIL } from "./demo";

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  console.log(`  [OK] ${msg}`);
}

console.log("--- TESTE REAL: IDENTIDADE DE CONTAS DEMO ---");
ok(isDemoEmail(LEGACY_DEMO_EMAIL), "conta demo legada é reconhecida");
ok(isDemoEmail("demo+abc123@meucofre.com"), "sessão demo efêmera é reconhecida");
ok(isDemoEmail("DEMO+ABC@MEUCOFRE.COM"), "reconhecimento é case-insensitive");
ok(!isDemoEmail("cliente@meucofre.com"), "conta real do mesmo domínio NÃO é demo");
ok(!isDemoEmail("demo+abc@atacante.com"), "domínio externo NÃO é demo");
ok(!isDemoEmail("demofake@meucofre.com"), "prefixo sem '+' NÃO é demo");
ok(!isDemoEmail(""), "e-mail vazio NÃO é demo");
ok(!isDemoEmail(null), "e-mail nulo NÃO é demo");
console.log("\n[PASS] Apenas contas de demonstração isoladas podem semear ou apagar dados.");
