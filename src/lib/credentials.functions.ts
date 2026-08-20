import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Criptografia AES-GCM das senhas de credenciais de imóveis.
 * A chave vive apenas no servidor (segredo CREDENTIALS_ENC_KEY) e a senha
 * nunca é gravada em texto puro nem registrada em log.
 */
async function getKey(): Promise<CryptoKey> {
  const secret = process.env["CREDENTIALS_ENC_KEY"];
  if (!secret) throw new Error("Criptografia de credenciais não configurada");
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptPassword(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(plain)),
  );
  return `v1.${toBase64(iv)}.${toBase64(cipher)}`;
}

async function decryptPassword(payload: string): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Formato de senha inválido");
  const key = await getKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(parts[1]) as unknown as BufferSource },
    key,
    fromBase64(parts[2]) as unknown as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

const CredentialInput = z
  .object({
    id: z.string().uuid().nullable().optional(),
    property_id: z.string().uuid(),
    property_ids: z.array(z.string().uuid()).optional(),
    service: z.string().min(1),
    website: z.string().nullable(),
    access_link: z.string().nullable(),
    login: z.string().nullable(),
    recovery_email: z.string().nullable(),
    notes: z.string().nullable(),
    /** null = manter a senha atual; "" = apagar; string = nova senha */
    password: z.string().nullable(),
  })
  .strict();

export const savePropertyCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CredentialInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const passwordChanged = data.password !== null;
    let cipher: string | null = null;
    if (passwordChanged && data.password) cipher = await encryptPassword(data.password);

    const { data: result, error } = await supabase.rpc("upsert_property_credential_rpc", {
      p_id: (data.id ?? null) as unknown as string,
      p_property_id: data.property_id,
      p_credential: {
        service: data.service,
        website: data.website,
        access_link: data.access_link,
        login: data.login,
        recovery_email: data.recovery_email,
        notes: data.notes,
      },
      p_password_cipher: cipher ?? "",
      p_password_changed: passwordChanged,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.credential_id) throw new Error("Credencial não persistida");

    // Sincroniza os vínculos com múltiplos imóveis se fornecido
    if (data.property_ids && data.property_ids.length > 0) {
      const { error: syncError } = await supabase.rpc("sync_property_credential_links", {
        p_credential_id: row.credential_id,
        p_property_ids: data.property_ids,
      });
      if (syncError) throw new Error(syncError.message);
    }

    return { id: row.credential_id as string, passwordChanged };
  });

export const revealPropertyCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("reveal_property_credential_rpc", {
      p_id: data.id,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row) throw new Error("Credencial não encontrada");
    const cipher = row.password_cipher as string | null;
    const legacy = row.legacy_password as string | null;
    if (cipher) return { password: await decryptPassword(cipher), legacy: false };
    if (legacy) {
      // Migra a senha antiga em texto puro para o formato criptografado.
      const migrated = await encryptPassword(legacy);
      const { error: migErr } = await context.supabase
        .from("property_credentials")
        .update({ password: null, password_cipher: migrated, password_set_at: new Date().toISOString() })
        .eq("id", data.id)
        .select("id");
      if (migErr) throw new Error(migErr.message);
      return { password: legacy, legacy: true };
    }
    return { password: null, legacy: false };
  });
