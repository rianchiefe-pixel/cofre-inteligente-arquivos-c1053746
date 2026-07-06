import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { transactionTypeLabel } from "@/lib/format";
import { Plus, Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/categories")({
  head: () => ({ meta: [{ title: "Categorias — Meu Cofre" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("gasto_variavel");

  const cats = useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("categories").select("*").order("name")).data ?? [] });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("categories").insert({ user_id: u.user!.id, name, default_type: type as any });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Categoria criada"); setName(""); qc.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Categorias</h1>
        <p className="text-sm text-muted-foreground">Ajuste as categorias para refletir a sua realidade.</p>
      </div>

      <Card className="p-5">
        <form onSubmit={(e) => { e.preventDefault(); if (name) create.mutate(); }} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end">
          <div className="space-y-2"><Label>Nova categoria</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Manutenção predial" /></div>
          <div className="space-y-2">
            <Label>Tipo padrão</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(transactionTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="submit" variant="premium" disabled={!name || create.isPending}><Plus className="h-4 w-4" /> Adicionar</Button>
        </form>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(cats.data ?? []).map((c) => (
          <Card key={c.id} className="flex items-center gap-3 p-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Tag className="h-4 w-4" /></div>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{c.name}</p>
              <p className="text-xs text-muted-foreground">{transactionTypeLabel[c.default_type as string] ?? c.default_type}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}