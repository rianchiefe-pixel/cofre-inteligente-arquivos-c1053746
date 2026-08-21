import { createFileRoute } from "@tanstack/react-router";
import { AccessesManager } from "@/components/accesses-manager";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/accesses")({
  component: AccessesPage,
});

function AccessesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Acessos</h1>
        <p className="text-muted-foreground">Gerenciamento centralizado de todas as suas credenciais.</p>
      </div>
      <AccessesManager />
    </div>
  );
}
