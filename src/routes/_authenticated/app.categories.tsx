import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  Link as LinkIcon,
  ListChecks,
  History,
  Copy,
  ExternalLink,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { CategoryOrganizationContent } from "@/components/categories/category-organization-content";
import { generateTempAccessToken, getActiveTempAccessToken, revokeTempAccessToken } from "@/lib/temp-access.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/app/categories")({
  head: () => ({
    meta: [
      { title: "Organização de Categorias — Meu Cofre" },
      { name: "description", content: "Central de gestão e organização de categorias para o perfil Holding." }
    ],
  }),
  component: CategoriesMgmtPage,
});

function CategoriesMgmtPage() {
  const qc = useQueryClient();
  const HOLDING_PROFILE_ID = "2906fc21-93bc-42ad-8ca3-701b94fdb5f6";
  const [activeTab, setActiveTab] = useState("all");
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);

  const generateTokenFn = useServerFn(generateTempAccessToken);
  const getActiveTokenFn = useServerFn(getActiveTempAccessToken);
  const revokeTokenFn = useServerFn(revokeTempAccessToken);

  const { data: activeToken, isLoading: isLoadingToken } = useQuery({
    queryKey: ["active-temp-token", HOLDING_PROFILE_ID],
    queryFn: () => getActiveTokenFn({ data: { profileId: HOLDING_PROFILE_ID } }),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateTokenFn({ data: { profileId: HOLDING_PROFILE_ID } }),
    onSuccess: () => {
      toast.success("Link de acesso gerado com sucesso!");
      qc.invalidateQueries({ queryKey: ["active-temp-token"] });
      setIsTokenDialogOpen(true);
    },
    onError: (e: any) => toast.error("Erro ao gerar link: " + e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => revokeTokenFn({ data: { tokenId } }),
    onSuccess: () => {
      toast.success("Acesso temporário revogado.");
      qc.invalidateQueries({ queryKey: ["active-temp-token"] });
    },
    onError: (e: any) => toast.error("Erro ao revogar: " + e.message),
  });

  const tempAccessUrl = activeToken 
    ? `${window.location.origin}/acesso-temporario/categorias/${activeToken.token}`
    : "";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tempAccessUrl);
    toast.success("Link copiado para a área de transferência!");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organização de Categorias</h1>
          <p className="text-sm text-muted-foreground">Gestão centralizada para Advocacia Leliane Pereira (Holding)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeToken ? (
            <Button variant="outline" size="sm" className="gap-2 border-success/30 text-success hover:bg-success/5" onClick={() => setIsTokenDialogOpen(true)}>
              <ShieldCheck className="h-4 w-4" /> Link Ativo
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2" 
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              <LinkIcon className="h-4 w-4" /> Gerar Link 24h
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <History className="h-4 w-4" /> Auditoria
          </Button>
          <Button variant="premium" size="sm" className="gap-2">
            <ListChecks className="h-4 w-4" /> Revisão Guiada
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="all">Todas as Categorias</TabsTrigger>
          <TabsTrigger value="duplicates" className="gap-2">
            Revisão Inteligente
            {activeTab !== "duplicates" && (
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            )}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="all">
          <CategoryOrganizationContent profileId={HOLDING_PROFILE_ID} />
        </TabsContent>

        <TabsContent value="duplicates">
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              A IA analisou suas categorias e identificou possíveis duplicidades baseadas em nomes, acentos e padrões de uso.
            </p>
            <CategoryOrganizationContent profileId={HOLDING_PROFILE_ID} onlyDuplicates />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Acesso Temporário Seguro</DialogTitle>
            <DialogDescription>
              Este link permite que terceiros organizem categorias sem login. Expira automaticamente em 24h.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
              <div className="flex-1 text-xs truncate font-mono text-muted-foreground">
                {tempAccessUrl}
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copyToClipboard}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            {activeToken && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Expira em:</p>
                  <p className="font-medium">
                    {format(new Date(activeToken.expires_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Acessos:</p>
                  <p className="font-medium">{activeToken.access_count || 0}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex sm:justify-between gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5" 
              onClick={() => {
                if (confirm("Tem certeza que deseja revogar este acesso imediatamente?")) {
                  revokeMutation.mutate(activeToken!.id);
                  setIsTokenDialogOpen(false);
                }
              }}
              disabled={revokeMutation.isPending}
            >
              <XCircle className="h-4 w-4" /> Revogar Link
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsTokenDialogOpen(false)}>Fechar</Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(tempAccessUrl, '_blank')}>
                <ExternalLink className="h-4 w-4" /> Testar Link
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
