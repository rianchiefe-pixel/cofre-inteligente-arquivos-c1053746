import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Confirma se as integrações do servidor estão configuradas SEM expor segredos:
 * retorna apenas indicadores booleanos e um resumo textual.
 */
export const getIntegrationsHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const aiKey = process.env["LOVABLE_API_KEY"];
    const supabaseUrl = process.env["SUPABASE_URL"];
    const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const serviceRole = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const credentialsKey = process.env["CREDENTIALS_ENCRYPTION_KEY"];

    const checks = [
      { id: "ai", label: "Inteligência artificial (OCR e classificação)", ok: Boolean(aiKey) },
      { id: "database", label: "Banco de dados", ok: Boolean(supabaseUrl && publishable) },
      { id: "admin", label: "Operações administrativas", ok: Boolean(serviceRole) },
      { id: "credentials", label: "Criptografia de credenciais", ok: Boolean(credentialsKey) },
    ];
    return { ok: checks.every((c) => c.ok), checks };
  });
