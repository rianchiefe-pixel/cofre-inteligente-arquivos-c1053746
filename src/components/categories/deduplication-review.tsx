import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCategoryDeduplicationSuggestions } from "@/lib/ai/category-analyzer.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Wand2 } from "lucide-react";
import { toast } from "sonner";

interface DeduplicationReviewProps {
  profileId: string;
  token?: string;
  onRefresh: () => void;
}

export function DeduplicationReview({ profileId, token, onRefresh }: DeduplicationReviewProps) {
  const getSuggestionsFn = useServerFn(getCategoryDeduplicationSuggestions);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["deduplication-suggestions", profileId, token],
    queryFn: () => getSuggestionsFn({ data: { profileId, token } }),
  });

  if (isLoading) return <div>Analisando categorias...</div>;
  if (!data?.groups || data.groups.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Wand2 className="h-5 w-5 text-accent" />
        Revisão inteligente de duplicidades
      </h2>
      
      <div className="grid gap-4">
        {data.groups.map((group) => (
          <Card key={group.id} className="p-4 border-accent/20">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">Grupo: {group.suggestedName}</p>
                <p className="text-sm text-muted-foreground">{group.reason}</p>
                <div className="flex gap-2 mt-2">
                  {group.categories.map(c => (
                    <Badge key={c.id} variant="outline">{c.name} ({c.count})</Badge>
                  ))}
                </div>
              </div>
              <Button size="sm" variant="premium">Mesclar</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
