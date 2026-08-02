/** Prefixo das contas de demonstração efêmeras (isoladas por sessão). */
export const DEMO_PREFIX = "demo+";
export const DEMO_DOMAIN = "meucofre.com";
/** Conta demo compartilhada legada — mantida apenas para sessões já existentes. */
export const LEGACY_DEMO_EMAIL = "demo@meucofre.com";

export function isDemoEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").toLowerCase();
  if (!e) return false;
  return e === LEGACY_DEMO_EMAIL || (e.startsWith(DEMO_PREFIX) && e.endsWith(`@${DEMO_DOMAIN}`));
}
