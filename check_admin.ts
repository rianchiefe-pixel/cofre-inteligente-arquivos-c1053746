import { createClient } from '@supabase/supabase-js';

// Usando as mesmas env vars que o client normal, pois no sandbox
// elas podem apontar para o projeto correto.
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
  // Se RLS está ligado e não há sessão, não veremos nada.
  // Vamos tentar ver se conseguimos listar os perfis ou categorias
  // sem filtros de usuário (anon access?)
  const { data: profs } = await supabase.from('financial_profiles').select('*');
  console.log('Public Profiles:', profs?.length);
}
run();
