import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, SearchX, Inbox } from "lucide-react";
import type { ReactNode } from "react";

/** Mensagem legível a partir de um erro desconhecido, sem vazar objetos crus. */
export function errorMessage(error: unknown, fallback = "Erro inesperado"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  retrying,
  title = "Não foi possível carregar",
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
}) {
  return (
    <Card role="alert" className="border-destructive/40 bg-destructive/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{errorMessage(error)}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry} disabled={retrying}>
              <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} aria-hidden="true" />
              {retrying ? "Tentando…" : "Tentar novamente"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
      <Inbox className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function NotFoundState({
  title = "Registro não encontrado",
  description = "Ele pode ter sido excluído ou pertence a outra conta.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-8 text-center">
      <SearchX className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}
