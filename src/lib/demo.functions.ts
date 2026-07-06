import { createServerFn } from "@tanstack/react-start";

const DEMO_EMAIL = "demo@meucofre.com";
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