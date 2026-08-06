import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCategoryDeduplicationSuggestions } from "@/lib/ai/category-analyzer.functions";
import { mergeCategories } from "@/lib/categories-mgmt.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertCircle, 
  Wand2, 
  ArrowRight, 
  CheckCircle2, 
  Zap, 
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { DeduplicationGroup } from "@/lib/ai/category-analyzer.server";

interface DeduplicationReviewProps {
  profileId: string;
  token?: string;
  onRefresh: () => void;
}

export function DeduplicationReview({ profileId, token, onRefresh }: DeduplicationReviewProps) {
  const qc = useQueryClient();
  const getSuggestionsFn = useServerFn(getCategoryDeduplicationSuggestions);
  const mergeFn = useServerFn(mergeCategories);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["deduplication-suggestions", profileId, token],
    queryFn: () => getSuggestionsFn({ data: { profileId, token } }),
  });

  const mergeMutation = useMutation({
    mutationFn: async (group: DeduplicationGroup) => {
      // Find the category that matches the suggested name, or the first one
      const keepCategory = group.categories.find(c => c.name === group.suggestedName) || group.categories[0];
      const discards = group.categories.filter(c => c.id !== keepCategory.id);
      
      for (const discard of discards) {
        await mergeFn({ 
          data: { 
            keepId: keepCategory.id, 
            discardId: discard.id, 
            profileId, 
            token 
          } 
        });
      }
    },
    onSuccess: () => {
      toast.success("Categorias mescladas com sucesso");
      refetch();
      onRefresh();
    },
    onError: (e: any) => toast.error("Erro ao mesclar: " + e.message)
  });

  const bulkFixMutation = useMutation({
    mutationFn: async (groups: DeduplicationGroup[]) => {
      setIsProcessing(true);
      for (const group of groups) {
        if (group.confidence === "very_high") {
          const keepCategory = group.categories.find(c => c.name === group.suggestedName) || group.categories[0];
          const discards = group.categories.filter(c => c.id !== keepCategory.id);
          for (const discard of discards) {
            await mergeFn({ data: { keepId: keepCategory.id, discardId: discard.id, profileId, token } });
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Correção automática de alta confiança concluída");
      setIsProcessing(false);
      refetch();
      onRefresh();
    },
    onSettled: () => setIsProcessing(false)
  });

  if (isLoading) return (
    <div className="flex items-center gap-3 p-8 border rounded-xl bg-muted/20 animate-pulse">
      <RefreshCw className="h-5 w-5 animate-spin text-accent" />
      <span className="text-sm font-medium">Analisando duplicidades inteligentes...</span>
    </div>
  );

  const groups = data?.groups || [];
  if (groups.length === 0) return null;

  const highConfidenceGroups = groups.filter(g => g.confidence === "very_high");

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-accent" />
          Revisão inteligente de duplicidades
        </h2>
        {highConfidenceGroups.length > 0 && (
          <Button 
            variant="premium" 
            size="sm" 
            className="gap-2"
            disabled={isProcessing}
            onClick={() => bulkFixMutation.mutate(highConfidenceGroups)}
          >
            <Zap className="h-4 w-4 fill-current" />
            Corrigir {highConfidenceGroups.length} casos de alta confiança
          </Button>
        )}
      </div>
      
      <div className="grid gap-3">
        {groups.map((group) => (
          <Card key={group.id} className="p-4 border-accent/20 bg-accent/5 overflow-hidden relative">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={group.confidence === "very_high" ? "default" : "secondary"} className="text-[10px] uppercase tracking-wider">
                    Confiança {group.confidence === "very_high" ? "Muito Alta" : "Alta"}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {group.reason}
                  </span>
                </div>
                
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex flex-wrap gap-1.5">
                    {group.categories.map((c, idx) => (
                      <div key={c.id} className="flex items-center">
                        <Badge variant="outline" className="bg-background text-xs font-normal px-2 py-0.5">
                          {c.name}
                          {c.count > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">({c.count})</span>}
                        </Badge>
                        {idx < group.categories.length - 1 && <span className="mx-1 text-muted-foreground/30">+</span>}
                      </div>
                    ))}
                  </div>
                  <ArrowRight className="h-4 w-4 text-accent" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground underline decoration-accent/30 underline-offset-4">
                      {group.suggestedName}
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8"
                  onClick={() => mergeMutation.mutate(group)}
                  disabled={mergeMutation.isPending || isProcessing}
                >
                  {mergeMutation.isPending ? "Mesclando..." : "Confirmar Sugestão"}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
