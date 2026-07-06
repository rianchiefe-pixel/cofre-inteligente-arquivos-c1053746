import { ReactNode } from "react";
import { useCan, type Permission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export function RoleGate({
  perm,
  children,
  fallback = null,
}: {
  perm: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = useCan(perm);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export function RestrictedArea({ message }: { message?: string }) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
        <ShieldAlert className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="mb-2 text-lg font-semibold">Área restrita</h2>
      <p className="text-sm text-muted-foreground">
        {message ?? "Você não tem permissão para acessar esta seção. Solicite acesso ao proprietário da conta."}
      </p>
    </Card>
  );
}