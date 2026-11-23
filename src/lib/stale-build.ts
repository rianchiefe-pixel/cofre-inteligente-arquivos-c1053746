// Após uma nova publicação, abas antigas tentam carregar arquivos que não existem mais.
// Nesse caso, recarrega a página uma única vez (no máximo a cada 30s) para buscar a versão atual.
const PATTERN = /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Unable to preload CSS/i;

export function isStaleBuildError(error: unknown): boolean {
  const msg = String((error as { message?: string } | null)?.message ?? error);
  return PATTERN.test(msg);
}

export function reloadOnceForStaleBuild(): boolean {
  if (typeof window === "undefined") return false;
  const key = "chunk-reload-at";
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last <= 30000) return false;
  sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
  return true;
}
