import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { useEffect } from "react";
import { Users } from "lucide-react";

export function ProfileSelector() {
  const { activeProfileId, setActiveProfileId } = useActiveProfile();

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_profiles").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!activeProfileId && profiles && profiles.length > 0) {
      // Tenta encontrar o perfil 'Holding' por padrão ou o primeiro
      const holding = profiles.find(p => p.name.toLowerCase().includes('holding'));
      setActiveProfileId(holding?.id || profiles[0].id);
    }
  }, [profiles, activeProfileId, setActiveProfileId]);

  if (isLoading) return <div className="h-9 w-[200px] animate-pulse rounded-md bg-muted" />;

  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-muted-foreground" />
      <Select value={activeProfileId || ""} onValueChange={setActiveProfileId}>
        <SelectTrigger className="w-[200px] bg-background">
          <SelectValue placeholder="Selecionar Perfil" />
        </SelectTrigger>
        <SelectContent>
          {profiles?.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
