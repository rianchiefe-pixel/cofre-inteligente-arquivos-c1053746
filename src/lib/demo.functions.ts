import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DEMO_EMAIL = "demo@meucofre.com";
const DEMO_PASSWORD = "demo123456";

export const ensureDemoUser = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Try to find existing user by listing (paginated). For a demo account this is fine.
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) throw new Error(listError.message);
  const existing = list.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
  if (existing) {
    if (!existing.email_confirmed_at) {
      await supabaseAdmin.auth.admin.updateUserById(existing.id, { email_confirm: true, password: DEMO_PASSWORD });
    }
    return { ok: true };
  }
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
});

// -------------------- Demo data seed --------------------

async function isDemoUser(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id === userId && data?.user?.email?.toLowerCase() === DEMO_EMAIL;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Limpeza transacional no banco (ordem de dependências e nomes reais das tabelas
// ficam do lado do Postgres). Devolve os caminhos de arquivos liberados.
async function wipeDemoData(supabase: any, _userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("reset_demo_data_rpc");
  if (error) throw new Error(`Falha ao limpar dados: ${error.message}`);
  const state = Array.isArray(data) ? data[0] : data;
  return (state?.storage_paths ?? []) as string[];
}

async function removeStorageFiles(supabase: any, paths: string[]): Promise<string[]> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return [];
  const failed: string[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const slice = unique.slice(i, i + 100);
    const { error } = await supabase.storage.from("receipts").remove(slice);
    if (error) failed.push(...slice);
  }
  return failed;
}

async function runSeed(supabase: any, userId: string) {
  // ----- Profiles -----
  const profilesInput = [
    { name: "Pessoal", type: "pessoa_fisica", color: "#1e3a8a", primary_color: "#1e3a8a", accent_color: "#c9a24a" },
    { name: "Holding Familiar", type: "holding", color: "#0f172a", primary_color: "#0f172a", accent_color: "#f59e0b", legal_name: "Holding Familiar Demo Ltda" },
    { name: "Empresa Norte Gestão", type: "empresa", color: "#065f46", primary_color: "#065f46", accent_color: "#a7f3d0", legal_name: "Norte Gestão Demo S.A." },
    { name: "Imóveis Patrimoniais", type: "imovel", color: "#7c2d12", primary_color: "#7c2d12", accent_color: "#fed7aa" },
    { name: "Fazenda Boa Esperança", type: "projeto", color: "#365314", primary_color: "#365314", accent_color: "#bef264" },
  ] as const;
  const profiles: Record<string, string> = {};
  for (const p of profilesInput) {
    const { data, error } = await supabase.from("financial_profiles").insert({ ...p, user_id: userId }).select("id, name").single();
    if (error) throw new Error(`profile ${p.name}: ${error.message}`);
    profiles[p.name] = data.id;
  }

  // ----- Categories (add missing) -----
  const extraCats = [
    { name: "Cartório", default_type: "patrimonial" },
    { name: "Honorários", default_type: "despesa" },
    { name: "Compra de imóvel", default_type: "patrimonial" },
    { name: "Despesas pessoais", default_type: "pessoal" },
    { name: "Despesas empresariais", default_type: "empresarial" },
    { name: "Manutenção", default_type: "gasto_variavel" },
    { name: "Aluguel", default_type: "gasto_fixo" },
  ];
  const { data: existingCats } = await supabase.from("categories").select("id, name").eq("user_id", userId);
  const existingNames = new Set((existingCats ?? []).map((c: any) => c.name));
  for (const c of extraCats) {
    if (!existingNames.has(c.name)) {
      await supabase.from("categories").insert({ ...c, user_id: userId });
    }
  }
  const { data: allCats } = await supabase.from("categories").select("id, name").eq("user_id", userId);
  const catByName: Record<string, string> = {};
  for (const c of allCats ?? []) catByName[c.name] = c.id;
  const cat = (name: string) => catByName[name] ?? Object.values(catByName)[0];

  // ----- Banks -----
  const banksInput = [
    { name: "Banco do Brasil", color: "#facc15", profile: "Pessoal" },
    { name: "Bradesco", color: "#dc2626", profile: "Pessoal" },
    { name: "Itaú", color: "#f97316", profile: "Empresa Norte Gestão" },
    { name: "Nubank", color: "#7c3aed", profile: "Pessoal" },
    { name: "Caixa", color: "#1d4ed8", profile: "Pessoal" },
    { name: "Inter", color: "#ea580c", profile: "Empresa Norte Gestão" },
    { name: "Santander", color: "#b91c1c", profile: "Holding Familiar" },
  ];
  const banks: Record<string, string> = {};
  for (const b of banksInput) {
    const { data, error } = await supabase.from("banks").insert({ user_id: userId, profile_id: profiles[b.profile], name: b.name, color: b.color }).select("id, name").single();
    if (error) throw new Error(`bank ${b.name}: ${error.message}`);
    banks[b.name] = data.id;
  }

  // ----- Accounts -----
  const accountsInput = [
    { nickname: "BB Conta Corrente", bank: "Banco do Brasil", type: "corrente", profile: "Pessoal" },
    { nickname: "Bradesco Conta Corrente", bank: "Bradesco", type: "corrente", profile: "Pessoal" },
    { nickname: "Itaú Conta PJ", bank: "Itaú", type: "pj", profile: "Empresa Norte Gestão" },
    { nickname: "Nubank Cartão", bank: "Nubank", type: "cartao", profile: "Pessoal" },
    { nickname: "Caixa Poupança", bank: "Caixa", type: "poupanca", profile: "Pessoal" },
    { nickname: "Inter Digital", bank: "Inter", type: "carteira_digital", profile: "Empresa Norte Gestão" },
    { nickname: "Santander Holding", bank: "Santander", type: "corrente", profile: "Holding Familiar" },
  ];
  const accounts: Record<string, string> = {};
  for (const a of accountsInput) {
    const { data, error } = await supabase.from("accounts").insert({
      user_id: userId, profile_id: profiles[a.profile], bank_id: banks[a.bank], type: a.type, nickname: a.nickname,
    }).select("id, nickname").single();
    if (error) throw new Error(`account ${a.nickname}: ${error.message}`);
    accounts[a.nickname] = data.id;
  }

  // ----- Cards -----
  const cardsInput = [
    { name: "Nubank Platinum", bank: "Nubank", brand: "mastercard", last4: "1234", closing_day: 25, due_day: 5, profile: "Pessoal" },
    { name: "Itaú Empresarial", bank: "Itaú", brand: "visa", last4: "5678", closing_day: 20, due_day: 1, profile: "Empresa Norte Gestão" },
    { name: "Bradesco Visa", bank: "Bradesco", brand: "visa", last4: "9012", closing_day: 15, due_day: 25, profile: "Pessoal" },
    { name: "Santander Holding", bank: "Santander", brand: "mastercard", last4: "7788", closing_day: 10, due_day: 20, profile: "Holding Familiar" },
  ];
  for (const c of cardsInput) {
    await supabase.from("cards").insert({
      user_id: userId, profile_id: profiles[c.profile], bank_id: banks[c.bank],
      name: c.name, brand: c.brand, last4: c.last4, closing_day: c.closing_day, due_day: c.due_day,
    });
  }

  // ----- Properties -----
  const propsInput = [
    { name: "Apartamento Centro", type: "apartamento", city: "Guanambi", state: "BA", status: "alugado", purpose: "aluguel", owner_name: "João Demo", registration: "M-1001", acquisition_value: 320000, acquisition_date: "2019-05-10", profile: "Imóveis Patrimoniais" },
    { name: "Casa Bairro Santo Antônio", type: "casa", city: "Guanambi", state: "BA", status: "proprio", purpose: "moradia", owner_name: "João Demo", registration: "M-1002", acquisition_value: 480000, acquisition_date: "2015-11-20", profile: "Pessoal" },
    { name: "Fazenda Boa Esperança", type: "fazenda", city: "Candiba", state: "BA", status: "proprio", purpose: "rural", owner_name: "Família Demo", registration: "M-2001", acquisition_value: 1250000, acquisition_date: "2010-03-14", profile: "Fazenda Boa Esperança" },
    { name: "Terreno Urbano", type: "terreno_urbano", city: "Caetité", state: "BA", status: "em_aquisicao", purpose: "investimento", owner_name: "Holding Familiar Demo", registration: "M-3001", acquisition_value: 95000, acquisition_date: "2024-08-01", profile: "Holding Familiar" },
    { name: "Sala Comercial Centro", type: "sala_comercial", city: "Guanambi", state: "BA", status: "alugado", purpose: "uso_empresarial", owner_name: "Norte Gestão Demo", registration: "M-4001", acquisition_value: 210000, acquisition_date: "2021-02-18", profile: "Empresa Norte Gestão" },
  ];
  const properties: Record<string, string> = {};
  for (const p of propsInput) {
    const { data, error } = await supabase.from("properties").insert({ user_id: userId, profile_id: profiles[p.profile], ...p, profile: undefined }).select("id, name").single();
    if (error) throw new Error(`property ${p.name}: ${error.message}`);
    properties[p.name] = data.id;
  }

  // ----- Recipients -----
  const recipientsInput = [
    { name: "Condomínio Edifício Central", category: "Condomínio", type: "gasto_fixo", profile: "Pessoal" },
    { name: "Neoenergia Coelba", category: "Energia", type: "gasto_variavel", profile: "Pessoal" },
    { name: "Embasa", category: "Água", type: "gasto_variavel", profile: "Pessoal" },
    { name: "Cartório de Registro de Imóveis", category: "Cartório", type: "patrimonial", profile: "Holding Familiar" },
    { name: "Escritório Contábil Alfa", category: "Contabilidade", type: "empresarial", profile: "Empresa Norte Gestão" },
    { name: "Advogado Patrimonial", category: "Jurídico", type: "empresarial", profile: "Holding Familiar" },
    { name: "Loja de Materiais Construir", category: "Material de construção", type: "patrimonial", profile: "Imóveis Patrimoniais" },
    { name: "Prefeitura Municipal", category: "IPTU", type: "gasto_fixo", profile: "Imóveis Patrimoniais" },
    { name: "Internet FibraNet", category: "Internet", type: "gasto_fixo", profile: "Pessoal" },
    { name: "Mercado Central", category: "Mercado", type: "gasto_variavel", profile: "Pessoal" },
  ];
  const recipients: Record<string, string> = {};
  for (const r of recipientsInput) {
    const { data, error } = await supabase.from("recipients").insert({
      user_id: userId, name: r.name, default_category_id: cat(r.category), default_type: r.type, default_profile_id: profiles[r.profile],
    }).select("id, name").single();
    if (error) throw new Error(`recipient ${r.name}: ${error.message}`);
    recipients[r.name] = data.id;
  }

  // ----- Receipts -----
  type R = {
    amount: number; days: number; recipient: string; bank: string; account: string; profile: string;
    property?: string; category: string; type: string; method: string; status: string;
    auth: string; note: string; fixed?: boolean;
  };
  const rec: R[] = [
    // approved (20)
    { amount: 520.5, days: 3, recipient: "Condomínio Edifício Central", bank: "Banco do Brasil", account: "BB Conta Corrente", profile: "Pessoal", property: "Apartamento Centro", category: "Condomínio", type: "gasto_fixo", method: "boleto", status: "approved", auth: "BB-0001", note: "Condomínio mês", fixed: true },
    { amount: 289.9, days: 5, recipient: "Neoenergia Coelba", bank: "Bradesco", account: "Bradesco Conta Corrente", profile: "Pessoal", property: "Casa Bairro Santo Antônio", category: "Energia", type: "gasto_variavel", method: "pix", status: "approved", auth: "BR-0002", note: "Energia" },
    { amount: 128.4, days: 7, recipient: "Embasa", bank: "Bradesco", account: "Bradesco Conta Corrente", profile: "Pessoal", property: "Casa Bairro Santo Antônio", category: "Água", type: "gasto_variavel", method: "boleto", status: "approved", auth: "BR-0003", note: "Água" },
    { amount: 149.9, days: 8, recipient: "Internet FibraNet", bank: "Nubank", account: "Nubank Cartão", profile: "Pessoal", category: "Internet", type: "gasto_fixo", method: "credito_vista", status: "approved", auth: "NU-0004", note: "Internet", fixed: true },
    { amount: 1240.0, days: 12, recipient: "Prefeitura Municipal", bank: "Banco do Brasil", account: "BB Conta Corrente", profile: "Imóveis Patrimoniais", property: "Apartamento Centro", category: "IPTU", type: "gasto_fixo", method: "boleto", status: "approved", auth: "BB-0005", note: "IPTU parcela" },
    { amount: 3400.0, days: 15, recipient: "Loja de Materiais Construir", bank: "Itaú", account: "Itaú Conta PJ", profile: "Imóveis Patrimoniais", property: "Casa Bairro Santo Antônio", category: "Material de construção", type: "patrimonial", method: "transferencia", status: "approved", auth: "IT-0006", note: "Reforma" },
    { amount: 1800.0, days: 18, recipient: "Escritório Contábil Alfa", bank: "Itaú", account: "Itaú Conta PJ", profile: "Empresa Norte Gestão", category: "Contabilidade", type: "empresarial", method: "pix", status: "approved", auth: "IT-0007", note: "Honorários" },
    { amount: 750.0, days: 20, recipient: "Advogado Patrimonial", bank: "Santander", account: "Santander Holding", profile: "Holding Familiar", category: "Jurídico", type: "empresarial", method: "ted", status: "approved", auth: "SA-0008", note: "Consultoria" },
    { amount: 430.7, days: 22, recipient: "Mercado Central", bank: "Nubank", account: "Nubank Cartão", profile: "Pessoal", category: "Mercado", type: "gasto_variavel", method: "credito_vista", status: "approved", auth: "NU-0009", note: "Mercado" },
    { amount: 210.0, days: 25, recipient: "Cartório de Registro de Imóveis", bank: "Santander", account: "Santander Holding", profile: "Holding Familiar", property: "Terreno Urbano", category: "Cartório", type: "patrimonial", method: "pix", status: "approved", auth: "SA-0010", note: "Certidão" },
    { amount: 5000.0, days: 28, recipient: "Loja de Materiais Construir", bank: "Inter", account: "Inter Digital", profile: "Empresa Norte Gestão", property: "Sala Comercial Centro", category: "Reforma", type: "patrimonial", method: "transferencia", status: "approved", auth: "IN-0011", note: "Reforma sala" },
    { amount: 275.0, days: 35, recipient: "Internet FibraNet", bank: "Nubank", account: "Nubank Cartão", profile: "Empresa Norte Gestão", category: "Internet", type: "gasto_fixo", method: "credito_vista", status: "approved", auth: "NU-0012", note: "Internet escritório", fixed: true },
    { amount: 620.0, days: 40, recipient: "Condomínio Edifício Central", bank: "Banco do Brasil", account: "BB Conta Corrente", profile: "Pessoal", property: "Apartamento Centro", category: "Condomínio", type: "gasto_fixo", method: "boleto", status: "approved", auth: "BB-0013", note: "Condomínio anterior", fixed: true },
    { amount: 315.4, days: 45, recipient: "Neoenergia Coelba", bank: "Bradesco", account: "Bradesco Conta Corrente", profile: "Pessoal", property: "Casa Bairro Santo Antônio", category: "Energia", type: "gasto_variavel", method: "pix", status: "approved", auth: "BR-0014", note: "Energia anterior" },
    { amount: 10000.0, days: 50, recipient: "Advogado Patrimonial", bank: "Santander", account: "Santander Holding", profile: "Holding Familiar", category: "Investimentos", type: "investimento", method: "transferencia", status: "approved", auth: "SA-0015", note: "Aporte fundo" },
    { amount: 480.0, days: 55, recipient: "Mercado Central", bank: "Nubank", account: "Nubank Cartão", profile: "Pessoal", category: "Mercado", type: "gasto_variavel", method: "credito_vista", status: "approved", auth: "NU-0016", note: "Mercado" },
    { amount: 1500.0, days: 60, recipient: "Escritório Contábil Alfa", bank: "Itaú", account: "Itaú Conta PJ", profile: "Empresa Norte Gestão", category: "Contabilidade", type: "empresarial", method: "pix", status: "approved", auth: "IT-0017", note: "Honorários" },
    { amount: 950.0, days: 68, recipient: "Prefeitura Municipal", bank: "Banco do Brasil", account: "BB Conta Corrente", profile: "Imóveis Patrimoniais", property: "Sala Comercial Centro", category: "IPTU", type: "gasto_fixo", method: "boleto", status: "approved", auth: "BB-0018", note: "IPTU sala" },
    { amount: 2200.0, days: 75, recipient: "Loja de Materiais Construir", bank: "Inter", account: "Inter Digital", profile: "Fazenda Boa Esperança", property: "Fazenda Boa Esperança", category: "Manutenção", type: "gasto_variavel", method: "transferencia", status: "approved", auth: "IN-0019", note: "Cerca fazenda" },
    { amount: 640.0, days: 82, recipient: "Embasa", bank: "Bradesco", account: "Bradesco Conta Corrente", profile: "Pessoal", property: "Casa Bairro Santo Antônio", category: "Água", type: "gasto_variavel", method: "boleto", status: "approved", auth: "BR-0020", note: "Água" },
    // pending (6)
    { amount: 189.0, days: 1, recipient: "Neoenergia Coelba", bank: "Bradesco", account: "Bradesco Conta Corrente", profile: "Pessoal", category: "Energia", type: "gasto_variavel", method: "pix", status: "pending", auth: "BR-P021", note: "Aguardando conferência" },
    { amount: 340.0, days: 2, recipient: "Mercado Central", bank: "Nubank", account: "Nubank Cartão", profile: "Pessoal", category: "Mercado", type: "gasto_variavel", method: "credito_vista", status: "pending", auth: "NU-P022", note: "Nota fiscal" },
    { amount: 1200.0, days: 4, recipient: "Escritório Contábil Alfa", bank: "Itaú", account: "Itaú Conta PJ", profile: "Empresa Norte Gestão", category: "Contabilidade", type: "empresarial", method: "pix", status: "pending", auth: "IT-P023", note: "Aguardando aprovação" },
    { amount: 90.0, days: 6, recipient: "Cartório de Registro de Imóveis", bank: "Santander", account: "Santander Holding", profile: "Holding Familiar", category: "Cartório", type: "patrimonial", method: "pix", status: "pending", auth: "SA-P024", note: "Emolumentos" },
    { amount: 4500.0, days: 9, recipient: "Loja de Materiais Construir", bank: "Inter", account: "Inter Digital", profile: "Imóveis Patrimoniais", property: "Casa Bairro Santo Antônio", category: "Reforma", type: "patrimonial", method: "transferencia", status: "pending", auth: "IN-P025", note: "Aguardando NF" },
    { amount: 275.0, days: 10, recipient: "Internet FibraNet", bank: "Nubank", account: "Nubank Cartão", profile: "Empresa Norte Gestão", category: "Internet", type: "gasto_fixo", method: "credito_vista", status: "pending", auth: "NU-P026", note: "Conferir plano" },
    // rejected (3)
    { amount: 88.0, days: 14, recipient: "Mercado Central", bank: "Nubank", account: "Nubank Cartão", profile: "Pessoal", category: "Despesas pessoais", type: "pessoal", method: "credito_vista", status: "rejected", auth: "NU-R027", note: "Fora da política" },
    { amount: 350.0, days: 19, recipient: "Advogado Patrimonial", bank: "Santander", account: "Santander Holding", profile: "Holding Familiar", category: "Jurídico", type: "empresarial", method: "ted", status: "rejected", auth: "SA-R028", note: "Duplicado com outra NF" },
    { amount: 60.0, days: 26, recipient: "Neoenergia Coelba", bank: "Bradesco", account: "Bradesco Conta Corrente", profile: "Pessoal", category: "Energia", type: "gasto_variavel", method: "pix", status: "rejected", auth: "BR-R029", note: "Comprovante ilegível" },
    // archived (3)
    { amount: 200.0, days: 33, recipient: "Embasa", bank: "Bradesco", account: "Bradesco Conta Corrente", profile: "Pessoal", category: "Água", type: "gasto_variavel", method: "boleto", status: "archived", auth: "BR-A030", note: "Arquivado" },
    { amount: 1800.0, days: 42, recipient: "Escritório Contábil Alfa", bank: "Itaú", account: "Itaú Conta PJ", profile: "Empresa Norte Gestão", category: "Contabilidade", type: "empresarial", method: "pix", status: "archived", auth: "IT-A031", note: "Arquivo anterior" },
    { amount: 500.0, days: 70, recipient: "Prefeitura Municipal", bank: "Banco do Brasil", account: "BB Conta Corrente", profile: "Imóveis Patrimoniais", property: "Terreno Urbano", category: "IPTU", type: "gasto_fixo", method: "boleto", status: "archived", auth: "BB-A032", note: "IPTU quitado" },
  ];

  const fileNames = ["comprovante-condominio-janeiro.pdf", "pix-neoenergia.png", "boleto-cartorio.pdf", "transferencia-reforma.jpg"];
  const insertedIds: string[] = [];
  let idx = 0;
  for (const r of rec) {
    const file = fileNames[idx % fileNames.length];
    const payload = {
      user_id: userId,
      profile_id: profiles[r.profile],
      bank_id: banks[r.bank],
      account_id: accounts[r.account],
      category_id: cat(r.category),
      recipient_id: recipients[r.recipient],
      property_id: r.property ? properties[r.property] : null,
      file_path: `demo/${userId}/${file}`,
      file_name: file,
      file_mime: file.endsWith(".pdf") ? "application/pdf" : "image/png",
      ocr_status: "done" as const,
      payment_date: daysAgo(r.days),
      amount: r.amount,
      recipient_name: r.recipient,
      bank_name: r.bank,
      payment_method: r.method,
      description: r.note,
      auth_code: r.auth,
      transaction_type: r.type,
      is_fixed: r.fixed ?? false,
      status: r.status,
      notes: "Comprovante demo",
      approved_at: r.status === "approved" ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase.from("receipts").insert(payload).select("id").single();
    if (error) throw new Error(`receipt ${r.auth}: ${error.message}`);
    insertedIds.push(data.id);
    idx++;
  }

  // ----- Duplicate examples (4) -----
  const original = insertedIds[0]; // condomínio
  const dupPayloads = [
    { score: 55, note: "Mesmo valor e data", days: 3, amount: 520.5, auth: "DUP-055" },
    { score: 70, note: "Mesmo valor, data e destinatário", days: 3, amount: 520.5, auth: "DUP-070" },
    { score: 85, note: "Mesmo valor, data, destinatário e banco", days: 3, amount: 520.5, auth: "DUP-085" },
    { score: 100, note: "Mesmo código de autenticação", days: 3, amount: 520.5, auth: "BB-0001" },
  ];
  for (const d of dupPayloads) {
    const { data, error } = await supabase.from("receipts").insert({
      user_id: userId,
      profile_id: profiles["Pessoal"],
      bank_id: banks["Banco do Brasil"],
      account_id: accounts["BB Conta Corrente"],
      category_id: cat("Condomínio"),
      recipient_id: recipients["Condomínio Edifício Central"],
      property_id: properties["Apartamento Centro"],
      file_path: `demo/${userId}/duplicado-${d.score}.pdf`,
      file_name: `duplicado-${d.score}.pdf`,
      file_mime: "application/pdf",
      ocr_status: "done" as const,
      payment_date: daysAgo(d.days),
      amount: d.amount,
      recipient_name: "Condomínio Edifício Central",
      bank_name: "Banco do Brasil",
      payment_method: "boleto",
      description: d.note,
      auth_code: d.auth,
      transaction_type: "gasto_fixo",
      status: d.score >= 100 ? "duplicate" : "pending",
      duplicate_of: original,
      duplicate_score: d.score,
      notes: "Comprovante demo (duplicidade)",
    }).select("id").single();
    if (error) throw new Error(`dup ${d.score}: ${error.message}`);
    insertedIds.push(data.id);
  }

  // ----- Audit logs -----
  const auditRows = [
    { action: "create", entity: "profile", entity_id: profiles["Holding Familiar"], profile_id: profiles["Holding Familiar"], note: "Perfil criado" },
    { action: "upload", entity: "receipt", entity_id: insertedIds[0], profile_id: profiles["Pessoal"], note: "Upload de comprovante" },
    { action: "approve", entity: "receipt", entity_id: insertedIds[0], profile_id: profiles["Pessoal"], note: "Aprovado" },
    { action: "reject", entity: "receipt", entity_id: insertedIds[27], profile_id: profiles["Pessoal"], note: "Rejeitado" },
    { action: "update", entity: "category", note: "Categoria alterada" },
    { action: "export", entity: "report", note: "Exportação PDF de relatórios" },
    { action: "archive", entity: "property", entity_id: properties["Terreno Urbano"], property_id: properties["Terreno Urbano"], note: "Imóvel arquivado" },
  ];
  for (const a of auditRows) {
    await supabase.from("audit_logs").insert({ ...a, user_id: userId });
  }
}

export const resetDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    if (!(await isDemoUser(supabase, userId))) {
      throw new Error("Somente a conta demo pode ser resetada.");
    }
    const paths = await wipeDemoData(supabase, userId);
    const failed = await removeStorageFiles(supabase, paths);
    return { ok: true as const, filesRemoved: paths.length - failed.length, filesFailed: failed.length };
  });

export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reset?: boolean }) => data ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    if (!(await isDemoUser(supabase, userId))) {
      throw new Error("Seed disponível apenas para a conta demo");
    }
    // idempotência: se já existe perfil "Holding Familiar" e não é reset, apenas retorna
    const { data: existing } = await supabase
      .from("financial_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Holding Familiar")
      .limit(1);
    
    if (existing && existing.length > 0 && !data.reset) {
      return { ok: true, seeded: false };
    }
    
    const paths = await wipeDemoData(supabase, userId);
    await removeStorageFiles(supabase, paths);
    await runSeed(supabase, userId);
    return { ok: true as const, seeded: true };
  });