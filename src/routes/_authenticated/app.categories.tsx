import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { transactionTypeLabel } from "@/lib/format";
import { Plus, Tag, Pencil, Trash2, Archive, ArchiveRestore, Sparkles } from "lucide-react";
import { LoadingState, ErrorState, EmptyState } from "@/components/query-states";
import { useServerFn } from "@tanstack/react-start";
import { fixPessoalCategories } from "@/lib/pessoal-fixer.functions";

export const Route = createFileRoute("/_authenticated/app/categories")({
  head: () => ({
    meta: [
      { title: "Categorias — Meu Cofre" },
      { name: "description", content: "Crie, edite, arquive e exclua categorias financeiras com reatribuição segura dos lançamentos." },
      { property: "og:title", content: "Categorias — Meu Cofre" },
      { property: "og:description", content: "Gerencie as categorias do seu cofre financeiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CategoriesPage,
});

type CatRow = { id: string; name: string; default_type: string | null; archived: boolean; parent_id: string | null };

function CategoriesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("gasto_variavel");
  const [edit, setEdit] = useState<CatRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("gasto_variavel");
  const [removing, setRemoving] = useState<CatRow | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [fixing, setFixing] = useState(false);
  const fixPessoal = useServerFn(fixPessoalCategories);

  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name, default_type, archived, parent_id").order("name");
      if (error) throw error;
      return (data ?? []) as CatRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["categories"] });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("upsert_category_rpc", {
        p_id: null as unknown as string,
        p_category: { name, default_type: type, archived: false },
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.category_id) throw new Error("Categoria não persistida");
      return row.category_id as string;
    },
    onSuccess: () => { toast.success("Categoria criada"); setName(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (patch: { id: string; name: string; default_type: string | null; archived: boolean; parent_id: string | null }) => {
      const { data, error } = await supabase.rpc("upsert_category_rpc", {
        p_id: patch.id,
        p_category: { name: patch.name, default_type: patch.default_type, archived: patch.archived, parent_id: patch.parent_id },
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.category_id) throw new Error("Nenhuma alteração confirmada");
    },
    onSuccess: () => { toast.success("Categoria atualizada"); setEdit(null); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: string | null }) => {
      const { data, error } = await supabase.rpc("delete_category_rpc", {
        p_id: id,
        p_reassign_to: (to ?? null) as unknown as string,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.deleted_id) throw new Error("Exclusão não confirmada");
      return row as { deleted_id: string; reassigned_receipts: number; orphaned_children: number };
    },
    onSuccess: (row) => {
      toast.success(
        row.reassigned_receipts + row.orphaned_children > 0
          ? `Categoria excluída. ${row.reassigned_receipts} comprovante(s) e ${row.orphaned_children} subcategoria(s) reatribuídos.`
          : "Categoria excluída",
      );
      setRemoving(null); setReassignTo(""); invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const list = cats.data ?? [];
  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Categorias</h1>
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">Ajuste as categorias para refletir a sua realidade.</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 gap-2 border-accent/40 text-accent hover:bg-accent/5"
            disabled={fixing || cats.isLoading}
            onClick={async () => {
              if (!confirm("Esta ação irá aplicar a taxonomia oficial ao Perfil Pessoal, movendo lançamentos compatíveis e arquivando categorias antigas. Deseja continuar?")) return;
              setFixing(true);
              try {
                const res = await fixPessoal();
                toast.success(`Taxonomia aplicada: ${res.categoriesCount} categorias criadas/verificadas e ${res.movedCount} grupos de lançamentos movidos.`);
                invalidate();
              } catch (e: any) {
                toast.error(e.message ?? "Falha ao corrigir categorias");
              } finally {
                setFixing(false);
              }
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Padronizar Perfil Pessoal
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <form onSubmit={(e) => { e.preventDefault(); if (busy || !name) return; create.mutate(); }} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end">
          <div className="space-y-2"><Label>Nova categoria</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Manutenção predial" /></div>
          <div className="space-y-2">
            <Label>Tipo padrão</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(transactionTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="submit" variant="premium" disabled={!name || busy}><Plus className="h-4 w-4" /> Adicionar</Button>
        </form>
      </Card>

      {cats.isLoading && <LoadingState label="Carregando categorias…" />}

      {cats.isError && (
        <ErrorState
          error={cats.error}
          title="Não foi possível carregar as categorias"
          retrying={cats.isFetching}
          onRetry={() => cats.refetch()}
        />
      )}

      {!cats.isLoading && !cats.isError && list.length === 0 && (
        <EmptyState title="Nenhuma categoria cadastrada" description="Crie categorias para organizar despesas, receitas e investimentos." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <Card key={c.id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 ${c.archived ? "opacity-60" : ""}`}>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Tag className="h-4 w-4" /></div>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{c.name} {c.archived && <Badge variant="outline" className="ml-1 text-[10px]">Arquivada</Badge>}</p>
              <p className="text-xs text-muted-foreground">{transactionTypeLabel[c.default_type as string] ?? c.default_type ?? "—"}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEdit(c); setEditName(c.name); setEditType(c.default_type ?? "gasto_variavel"); }}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" disabled={busy} title={c.archived ? "Reativar" : "Arquivar"}
                onClick={() => update.mutate({ id: c.id, name: c.name, default_type: c.default_type, parent_id: c.parent_id, archived: !c.archived })}>
                {c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { setRemoving(c); setReassignTo(""); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar categoria</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!edit) return;
              update.mutate({ id: edit.id, name: editName, default_type: editType, parent_id: edit.parent_id, archived: edit.archived });
            }}
          >
            <div className="space-y-2"><Label>Nome</Label><Input required value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Tipo padrão</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(transactionTypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button type="submit" variant="premium" disabled={update.isPending || !editName}>Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(o) => { if (!o) { setRemoving(null); setReassignTo(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir categoria</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se existirem comprovantes ou subcategorias vinculados, escolha uma categoria de destino para reatribuí-los. Sem destino, a exclusão é bloqueada.
            </p>
            <div className="space-y-2">
              <Label>Reatribuir para</Label>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger><SelectValue placeholder="Nenhuma (bloquear se houver vínculos)" /></SelectTrigger>
                <SelectContent>
                  {list.filter((c) => c.id !== removing?.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRemoving(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => removing && remove.mutate({ id: removing.id, to: reassignTo || null })}
              >
                Excluir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
