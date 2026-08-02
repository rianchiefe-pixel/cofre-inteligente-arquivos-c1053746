import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Cria uma conta de demonstração EFÊMERA e ISOLADA por sessão.
 * Não existe mais conta demo global compartilhada: dados de uma visita nunca
 * ficam visíveis para outra. Há limite de criação por janela de tempo.
 */
export const startDemoSession = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { DEMO_PREFIX, DEMO_DOMAIN } = await import("./demo");

  // Rate limit: no máximo 20 sessões demo criadas nos últimos 10 minutos.
  const WINDOW_MS = 10 * 60 * 1000;
  const MAX_IN_WINDOW = 20;
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) throw new Error(`Não foi possível iniciar o modo teste: ${listError.message}`);
  const since = Date.now() - WINDOW_MS;
  const recent = list.users.filter(
    (u) =>
      (u.email ?? "").toLowerCase().startsWith(DEMO_PREFIX) &&
      u.created_at &&
      new Date(u.created_at).getTime() >= since,
  );
  if (recent.length >= MAX_IN_WINDOW) {
    throw new Error("O modo teste está com muitos acessos simultâneos. Tente novamente em alguns minutos.");
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const email = `${DEMO_PREFIX}${token}@${DEMO_DOMAIN}`;
  const password = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { demo: true, demo_created_at: new Date().toISOString() },
  });
  if (error) throw new Error(`Não foi possível iniciar o modo teste: ${error.message}`);
  return { email, password };
});

/** Apaga todos os dados da conta demo (mantém a conta zerada). */
export const resetDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { assertDemoUser, wipeDemoData, removeStorageFiles } = await import("./demo.server");
    await assertDemoUser(supabase, userId);
    const paths = await wipeDemoData(supabase, userId);
    const failed = await removeStorageFiles(supabase, paths);
    return { ok: true as const, filesRemoved: paths.length - failed.length, filesFailed: failed.length };
  });

/** Limpa e recria os dados fictícios em uma única operação com rollback. */
export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reset: z.boolean().optional() }).strict().parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { assertDemoUser, resetAndSeed } = await import("./demo.server");
    await assertDemoUser(supabase, userId);

    // idempotência: já semeado e sem pedido explícito de reset → não repete
    const { data: existing, error: existingError } = await supabase
      .from("financial_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Holding Familiar")
      .limit(1);
    if (existingError) throw new Error(`Falha ao verificar dados demo: ${existingError.message}`);
    if (existing && existing.length > 0 && !data.reset) {
      return { ok: true as const, seeded: false, filesRemoved: 0, filesFailed: 0 };
    }

    const result = await resetAndSeed(supabase, userId);
    return { ok: true as const, seeded: true, ...result };
  });
