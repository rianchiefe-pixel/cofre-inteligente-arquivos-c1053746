import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Tag, 
  Search, 
  Filter, 
  Merge, 
  AlertCircle, 
  MoreHorizontal,
  Settings2,
  ArrowRight
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getCategoryStats, mergeCategories, bulkUpdateCategories } from "@/lib/categories-mgmt.functions";
import { transactionTypeLabel } from "@/lib/format";
import { LoadingState } from "@/components/query-states";

interface CategoryOrganizationContentProps {
  profileId?: string;
  token?: string;
  readOnly?: boolean;
}

export function CategoryOrganizationContent({ profileId, token, readOnly = false }: CategoryOrganizationContentProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeKeepId, setMergeKeepId] = useState("");
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkType, setBulkType] = useState("");
  const [bulkParentId, setBulkParentId] = useState<string | null>(null);

  const fetchStatsFn = useServerFn(getCategoryStats);
  const performMergeFn = useServerFn(mergeCategories);
  const performBulkFn = useServerFn(bulkUpdateCategories);

  const { data, isLoading } = useQuery({
    queryKey: ["categories-mgmt", profileId, token],
    queryFn: () => fetchStatsFn({ data: { profileId, token } }),
  });

  const categories = data?.categories || [];
  const stats = data?.stats;

  const filteredCategories = useMemo(() => {
    let result = (categories as any[]).filter((c: any) => 
      c.name.toLowerCase().includes(search.toLowerCase())
    );

    if (filter === "needs_review") {
      result = result.filter((c: any) => !c.default_type || c.archived);
    } else if (filter === "main") {
      result = result.filter((c: any) => !c.parent_id);
    } else if (filter === "sub") {
      result = result.filter((c: any) => c.parent_id);
    } else if (filter === "archived") {
      result = result.filter((c: any) => c.archived);
    }

    return result;
  }, [categories, search, filter]);

  const bulkUpdateMutation = useMutation({
    mutationFn: (patch: any) => performBulkFn({ data: { ids: selectedIds, patch, token, profileId } }),
    onSuccess: () => {
      toast.success("Atualização em massa concluída");
      setSelectedIds([]);
      setIsBulkDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["categories-mgmt"] });
    },
    onError: (e: any) => toast.error("Erro na atualização: " + e.message),
  });

  const mergeMutation = useMutation({
    mutationFn: () => {
      if (selectedIds.length !== 2) throw new Error("Selecione exatamente 2 categorias");
      const discardId = selectedIds.find(id => id !== mergeKeepId);
      if (!discardId) throw new Error("Selecione a categoria que será mantida");
      return performMergeFn({ data: { keepId: mergeKeepId, discardId, profileId: profileId!, token } });
    },
    onSuccess: () => {
      toast.success("Mesclagem concluída com sucesso");
      setSelectedIds([]);
      setIsMergeDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["categories-mgmt"] });
    },
    onError: (e: any) => toast.error("Erro na mesclagem: " + e.message),
  });

  if (isLoading) return <LoadingState label="Carregando central de categorias..." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Total" value={stats?.total} />
        <StatCard label="Principais" value={stats?.main} />
        <StatCard label="Subcategorias" value={stats?.sub} />
        <StatCard label="Arquivadas" value={stats?.archived} />
        <StatCard label="Sem tipo" value={stats?.unclassified} color="text-warning" />
        <StatCard label="Duplicatas" value={stats?.duplicates} color="text-destructive" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nome..." 
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filtrar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="needs_review">Precisa de Revisão</SelectItem>
                <SelectItem value="main">Principais</SelectItem>
                <SelectItem value="sub">Subcategorias</SelectItem>
                <SelectItem value="archived">Arquivadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!readOnly && selectedIds.length > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
              <span className="text-xs font-medium text-muted-foreground">{selectedIds.length} selecionadas</span>
              {selectedIds.length === 2 && (
                <Button variant="outline" size="sm" className="gap-2 text-accent border-accent/20" onClick={() => setIsMergeDialogOpen(true)}>
                  <Merge className="h-4 w-4" /> Mesclar
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsBulkDialogOpen(true)}>
                <Settings2 className="h-4 w-4" /> Ações em massa
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-3 pl-2">
                  {!readOnly && (
                    <Checkbox 
                      checked={selectedIds.length === filteredCategories.length && filteredCategories.length > 0} 
                      onCheckedChange={(c) => setSelectedIds(c ? filteredCategories.map((cat: any) => cat.id) : [])} 
                    />
                  )}
                </th>
                <th className="pb-3 font-medium">Nome</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Estrutura</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCategories.map((cat: any) => (
                <tr key={cat.id} className={`group hover:bg-muted/30 ${selectedIds.includes(cat.id) ? "bg-muted/50" : ""}`}>
                  <td className="py-4 pl-2">
                    {!readOnly && (
                      <Checkbox 
                        checked={selectedIds.includes(cat.id)} 
                        onCheckedChange={(c) => setSelectedIds(prev => c ? [...prev, cat.id] : prev.filter(id => id !== cat.id))} 
                      />
                    )}
                  </td>
                  <td className="py-4 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {cat.name}
                      {!cat.default_type && <AlertCircle className="h-3.5 w-3.5 text-warning" />}
                    </div>
                  </td>
                  <td className="py-4">
                    {cat.default_type ? (
                      <Badge variant="secondary" className="font-normal">
                        {transactionTypeLabel[cat.default_type as keyof typeof transactionTypeLabel] || cat.default_type}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground italic">Não definido</span>
                    )}
                  </td>
                  <td className="py-4">
                    {cat.parent_id ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>Subcategoria de</span>
                        <Badge variant="outline" className="text-[10px]">
                          {categories.find((p: any) => p.id === cat.parent_id)?.name || "Pai desconhecido"}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-accent uppercase tracking-wider">Principal</span>
                    )}
                  </td>
                  <td className="py-4">
                    {cat.archived ? (
                      <Badge variant="outline" className="text-muted-foreground">Inativo/Arquivado</Badge>
                    ) : (
                      <Badge variant="outline" className="border-success/30 text-success bg-success/5">Ativo</Badge>
                    )}
                  </td>
                  <td className="py-4 text-right">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredCategories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground mb-3">
                <Tag className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold">Nenhuma categoria encontrada</h3>
              <p className="text-sm text-muted-foreground mt-1">Tente ajustar seus filtros ou busca.</p>
            </div>
          )}
        </div>
      </Card>

      {!readOnly && (
        <>
          <Dialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Merge className="h-5 w-5 text-accent" /> Mesclar Categorias
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Você está mesclando duas categorias. Todos os lançamentos serão transferidos para a categoria mantida e a outra será arquivada.
                </p>
                <div className="space-y-3">
                  <label className="text-sm font-medium">Qual categoria deseja MANTER?</label>
                  <Select value={mergeKeepId} onValueChange={setMergeKeepId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a definitiva" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedIds.map(id => {
                        const cat = categories.find((c: any) => c.id === id);
                        return <SelectItem key={id} value={id}>{cat?.name}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {mergeKeepId && (
                  <div className="rounded-lg bg-muted/50 p-3 border border-border">
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">De: <span className="text-foreground font-medium">{categories.find((c: any) => c.id !== mergeKeepId && selectedIds.includes(c.id))?.name}</span></div>
                      <ArrowRight className="h-3 w-3 mx-2 text-muted-foreground" />
                      <div className="text-success font-medium">Para: {categories.find((c: any) => c.id === mergeKeepId)?.name}</div>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsMergeDialogOpen(false)}>Cancelar</Button>
                <Button variant="premium" disabled={!mergeKeepId || mergeMutation.isPending} onClick={() => mergeMutation.mutate()}>
                  {mergeMutation.isPending ? "Processando..." : "Confirmar Mesclagem"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ações em Massa ({selectedIds.length} selecionadas)</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Alterar Tipo</label>
                  <Select value={bulkType} onValueChange={setBulkType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Manter atual" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(transactionTypeLabel).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Mover para Categoria Principal</label>
                  <Select value={bulkParentId || "null"} onValueChange={(v) => setBulkParentId(v === "null" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Manter atual" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">Tornar Principal</SelectItem>
                      {categories.filter((c: any) => !c.parent_id && !selectedIds.includes(c.id)).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg bg-warning/5 border border-warning/20 p-3">
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning-foreground">
                      Esta alteração afetará as definições de {selectedIds.length} categorias. Lançamentos vinculados não serão movidos, apenas a classificação da categoria será alterada.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsBulkDialogOpen(false)}>Cancelar</Button>
                <Button variant="premium" disabled={bulkUpdateMutation.isPending} onClick={() => {
                  const patch: any = {};
                  if (bulkType) patch.default_type = bulkType;
                  if (bulkParentId !== undefined) patch.parent_id = bulkParentId;
                  bulkUpdateMutation.mutate(patch);
                }}>
                  Aplicar Alterações
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color = "text-foreground" }: { label: string; value?: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value ?? 0}</p>
    </div>
  );
}
