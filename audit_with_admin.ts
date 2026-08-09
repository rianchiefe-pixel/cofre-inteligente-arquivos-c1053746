import { createClient } from '@supabase/supabase-js';

// Usamos as env vars internas que o sandbox injeta para o Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Tenta usar service role se disponível no env
);

async function run() {
  try {
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('*');
    
    if (catError) {
      console.log("Erro categorias:", catError.message);
    } else {
      console.log("Categorias (Admin):", categories?.length);
      if (categories && categories.length > 0) {
        console.log(JSON.stringify(categories.slice(0, 5), null, 2));
      }
    }
  } catch (e) {
    console.error("Falha fatal:", e);
  }
}
run();
