import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  AlertCircle, 
  Search, 
  Filter, 
  CheckCircle2, 
  History, 
  ChevronRight,
  Eye,
  MoreVertical,
  Check,
  BrainCircuit,
  LayoutGrid
} from 'lucide-react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { currencyBRL } from '@/lib/format';
import { UNCATEGORIZED } from '@/lib/report-data';

export const Route = createFileRoute('/_authenticated/app/categories/pending')({
  component: PendingCategorization,
});

function PendingCategorization() {
  const queryClient = useQueryClient();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [profileFilter, setProfileFilter] = useState<string>('all');
  
  // Regra de detecção: category_id IS NULL ou categorias técnicas de ausência
  const { data: pendingReceipts, isLoading } = useQuery({
    queryKey: ['pending-categorization-receipts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select(`
          id,
          payment_date,
          recipient_name,
          amount,
          transaction_type,
          expense_behavior,
          category_id,
          categories(name),
          profiles(name),
          bank_name,
          status,
          ai_suggested_category_id,
          ai_category_suggestion,
          ai_category_confidence,
          ai_category_reason
        `)
        .eq('status', 'approved')
        .or(`category_id.is.null,category_id.in.(select id from categories where name in ('Não identificado', 'Não informado', '${UNCATEGORIZED}'))`);
      
      if (error) throw error;
      return data;
    }
  });

  const { data: allCategories } = useQuery({
    queryKey: ['all-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_archived', false)
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ receiptId, categoryId, method }: { receiptId: string, categoryId: string, method: 'manual' | 'ai_suggested' }) => {
      const { data: oldReceipt } = await supabase.from('receipts').select('category_id').eq('id', receiptId).single();
      
      const { error } = await supabase
        .from('receipts')
        .update({ category_id: categoryId })
        .eq('id', receiptId);
      
      if (error) throw error;

      // Registrar auditoria
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        entity_type: 'receipt',
        entity_id: receiptId,
        action: 'categorize',
        user_id: userData.user?.id,
        old_data: { category_id: oldReceipt?.category_id },
        new_data: { category_id: categoryId, method }
      });

      return { receiptId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-categorization-receipts'] });
      toast.success('Categoria atualizada com sucesso');
    }
  });

  const stats = useMemo(() => {
    if (!pendingReceipts) return { count: 0, total: 0 };
    return {
      count: pendingReceipts.length,
      total: pendingReceipts.reduce((sum, r) => sum + (r.amount || 0), 0)
    };
  }, [pendingReceipts]);

  const filteredData = useMemo(() => {
    if (!pendingReceipts) return [];
    return pendingReceipts.filter(r => {
      const matchesSearch = !searchTerm || 
        (r.recipient_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.bank_name?.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesProfile = profileFilter === 'all' || r.profiles?.name === profileFilter;
      return matchesSearch && matchesProfile;
    });
  }, [pendingReceipts, searchTerm, profileFilter]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando pendências...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pendências de Categorização</h1>
          <p className="text-muted-foreground">Localize e corrija lançamentos sem categoria identificada.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-accent/20 bg-accent/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold">Sem categoria</CardDescription>
            <CardTitle className="text-2xl">{stats.count} lançamentos</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold">Valor Total</CardDescription>
            <CardTitle className="text-2xl">{currencyBRL(stats.total)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar favorecido ou banco..." 
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={profileFilter} onValueChange={setProfileFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos os Perfis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Perfis</SelectItem>
            {/* Populate dynamically if needed */}
          </SelectContent>
        </Select>
      </div>

      {filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 rounded-xl border-2 border-dashed">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div>
            <h3 className="text-lg font-semibold">Tudo categorizado ✓</h3>
            <p className="text-muted-foreground">Não há lançamentos sem categoria neste período.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox 
                    checked={selectedRows.length === filteredData.length}
                    onCheckedChange={(checked) => {
                      setSelectedRows(checked ? filteredData.map(r => r.id) : []);
                    }}
                  />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Favorecido</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Sugestão IA</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedRows.includes(row.id)}
                      onCheckedChange={(checked) => {
                        setSelectedRows(prev => checked ? [...prev, row.id] : prev.filter(id => id !== row.id));
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.payment_date ? format(new Date(row.payment_date), 'dd/MM/yyyy') : '—'}
                  </TableCell>
                  <TableCell className="font-medium">{row.recipient_name || '—'}</TableCell>
                  <TableCell className={row.amount < 0 ? 'text-red-500' : 'text-blue-500'}>
                    {currencyBRL(row.amount)}
                  </TableCell>
                  <TableCell>{row.profiles?.name || '—'}</TableCell>
                  <TableCell className="text-xs">{row.bank_name || '—'}</TableCell>
                  <TableCell>
                    {row.ai_category_suggestion ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1.5 w-fit">
                          <BrainCircuit className="h-3 w-3" />
                          {row.ai_category_suggestion}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">Confiança: {(row.ai_category_confidence * 100).toFixed(0)}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Sem sugestão</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                       {row.ai_suggested_category_id && (
                         <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => updateCategoryMutation.mutate({ 
                            receiptId: row.id, 
                            categoryId: row.ai_suggested_category_id!,
                            method: 'ai_suggested'
                          })}
                        >
                          Usar Sugestão
                        </Button>
                       )}
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate({ to: `/app/vault`, search: { id: row.id } })}>
                            <Eye className="mr-2 h-4 w-4" /> Ver comprovante
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Tags className="mr-2 h-4 w-4" /> Definir categoria
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                       </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border shadow-lg rounded-full px-6 py-3 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">{selectedRows.length} selecionados</span>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" className="bg-primary text-primary-foreground">
            Definir categoria em lote
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedRows([])}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
