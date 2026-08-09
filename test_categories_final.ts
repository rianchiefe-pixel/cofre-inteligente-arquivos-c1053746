import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runTest() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  
  console.log("--- Testando Query de Categorias (Simulando getCategoryStats) ---");
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, default_type, archived, parent_id, created_at")
    .eq("user_id", userId);
  
  if (error) {
    console.error("ERRO NA QUERY:", error.message);
    process.exit(1);
  }
  
  console.log("Query executada com sucesso!");
  console.log("Quantidade de categorias carregadas:", data?.length);
  
  if (data && data.length > 0) {
    console.log("Exemplo de categoria:", data[0].name, "| Tipo:", data[0].default_type);
  } else {
    console.warn("AVISO: Nenhuma categoria retornada para o usuário.");
  }
}

runTest();
