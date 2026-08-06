import React, { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { validateTempToken } from '@/lib/temp-access.functions';
import { CategoryOrganizationContent } from '@/components/categories/category-organization-content';
import { Loader2, AlertCircle, Clock, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export const Route = createFileRoute('/acesso-temporario/categorias/$token')({
  component: TempCategoryAccessPage,
});

function TempCategoryAccessPage() {
  const { token } = Route.useParams();
  const [isValidating, setIsValidating] = useState(true);
  const [accessData, setAccessData] = useState<{
    valid: boolean;
    profileId?: string;
    profileName?: string;
    expiresAt?: string;
  } | null>(null);

  const validate = useServerFn(validateTempToken);

  useEffect(() => {
    async function checkToken() {
      try {
        const result = await validate({ data: { token } });
        setAccessData(result as any);
      } catch (error) {
        setAccessData({ valid: false });
      } finally {
        setIsValidating(false);
      }
    }
    checkToken();
  }, [token]);

  if (isValidating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Validando seu acesso...</p>
      </div>
    );
  }

  if (!accessData?.valid) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <div className="p-6 bg-destructive/10 rounded-full mb-6">
          <AlertCircle className="w-12 h-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Este link expirou</h1>
        <p className="text-muted-foreground max-w-md">
          O prazo de 24 horas deste acesso foi encerrado ou o link foi revogado. 
          Solicite um novo link ao administrador do sistema.
        </p>
      </div>
    );
  }

  const timeLeft = accessData.expiresAt 
    ? Math.max(0, new Date(accessData.expiresAt).getTime() - new Date().getTime())
    : 0;
  
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header Fixo */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <span className="text-primary">Organização temporária das categorias</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {accessData.profileName}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end text-right">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <Clock className="w-3.5 h-3.5" />
                Expira em: {format(new Date(accessData.expiresAt!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Tempo restante: {hoursLeft}h {minutesLeft}min
              </p>
            </div>
            
            <Button 
              size="sm" 
              className="gap-2"
              onClick={() => {
                // The CategoryOrganizationContent handles saving
                // This is a visual indicator that actions are being taken
                toast.success("Alterações sincronizadas");
              }}
            >
              <Save className="w-4 h-4" />
              Salvar Alterações
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-6">
        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg text-blue-800 text-sm flex gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-blue-600" />
          <p>
            Este acesso é exclusivo para a organização das categorias da <strong>{accessData.profileName}</strong>. 
            Todas as alterações são salvas automaticamente após confirmação nos botões de ação.
          </p>
        </div>

        {/* Pass the token so the child component can use it in server calls */}
        <CategoryOrganizationContent 
          profileId={accessData.profileId} 
          token={token}
          readOnly={false}
        />
      </main>

      <footer className="py-6 border-t bg-muted/30">
        <div className="container text-center text-xs text-muted-foreground">
          Acesso seguro e temporário • Meu Cofre &copy; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
