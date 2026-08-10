import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Search, 
  CheckCircle2, 
  Eye,
  MoreVertical,
  BrainCircuit,
  Tags,
  Check,
  ShieldAlert,
  ArrowRight,
  FileText
} from 'lucide-react';
import { 
  Card, 
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
import { Checkbox } from '@/components/ui/checkbox';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { currencyBRL } from '@/lib/format';
import { UNCATEGORIZED, TECHNICAL_UNCATEGORIZED_NAMES } from '@/lib/report-data';
import { useActiveProfile } from '@/hooks/use-active-profile';
import { cn } from '@/lib/utils';
import { isUncategorizedReceipt } from '@/lib/categorization-utils';
import { z } from 'zod';
import { Label } from '@/components/ui/label';

const searchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  profileId: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/app/categories/pending')({
  validateSearch: (s) => searchSchema.parse(s),
  component: PendingCategorizationPage,
});

function PendingCategorizationPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/_authenticated/app/categories/pending' });
  const queryClient = useQueryClient();
  const { activeProfileId } = useActiveProfile();
  
  const profileId = search.profileId || activeProfileId;
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Rule: category_id IS NULL or technical uncategorized categories
  const { data: pendingReceipts, isLoading } = useQuery({
    queryKey: ['pending-categorization-receipts', profileId, search.from, search.to],
    queryFn: async () => {
      let query = supabase
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
          financial_profiles(id, name),
          bank_name,
          status,
          ai_suggested_category_id,
          ai_confidence,
          ai_reason
        `)
        .eq('status', 'approved');

      if (profileId) {
        query = query.eq('profile_id', profileId);
      }
      
      if (search.from) {
        query = query.gte('payment_date', search.from);
      }
      
      if (search.to) {
        query = query.lte('payment_date', search.to);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).filter(r => isUncategorizedReceipt(r as any));
    }
  });

  const { data: allCategories } = useQuery({
    queryKey: ['all-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return (data || []).filter(c => !TECHNICAL_UNCATEGORIZED_NAMES.includes(c.name));
    }
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ receiptId, categoryId, method }: { receiptId: string, categoryId: string, method: 'manual' | 'ai_suggested' }) => {
      const { data: oldReceipt } = await supabase.from('receipts').select('category_id').eq('id', receiptId).single();
      
      const { error } = await supabase
        .from('receipts')
        .update({ 
          category_id: categoryId,
          is_manual_correction: true,
          user_confirmed_at: new Date().toISOString()
        })
        .eq('id', receiptId);
      
      if (error) throw error;

      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        entity: 'receipt',
        entity_id: receiptId,
        action: 'categorize',
        user_id: userData.user?.id || '',
        old_value: { category_id: oldReceipt?.category_id },
        new_value: { category_id: categoryId, method },
        profile_id: profileId
      });

      return { receiptId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-categorization-receipts'] });
      toast.success('Lançamento categorizado com sucesso');
    }
  });

  const stats = useMemo(() => {
    if (!pendingReceipts) return { count: 0, total: 0, withAi: 0, withoutAi: 0 };
    return {
      count: pendingReceipts.length,
      total: pendingReceipts.reduce((sum, r) => sum + Math.abs(r.amount || 0), 0),
      withAi: pendingReceipts.filter(r => !!r.ai_suggested_category_id).length,
      withoutAi: pendingReceipts.filter(r => !r.ai_suggested_category_id).length
    };
  }, [pendingReceipts]);

  const filteredData = useMemo(() => {
    if (!pendingReceipts) return [];
    return pendingReceipts.filter(r => {
      const matchesSearch = !searchTerm || 
        (r.recipient_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.bank_name?.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesSearch;
    });
  }, [pendingReceipts, searchTerm]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando pendências...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pendências de Categorização</h1>
          <p className="text-muted-foreground">Confira e categorize os lançamentos que ainda estão sem uma categoria definida.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-accent/20 bg-accent/5 shadow-none">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold">Lançamentos pendentes</CardDescription>
            <CardTitle className="text-2xl">{stats.count}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5 shadow-none">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold">Valor sem categoria</CardDescription>
            <CardTitle className="text-2xl">{currencyBRL(stats.total)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5 shadow-none">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold">Com sugestão da IA</CardDescription>
            <CardTitle className="text-2xl">{stats.withAi}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-muted bg-muted/20 shadow-none">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold">Sem sugestão</CardDescription>
            <CardTitle className="text-2xl">{stats.withoutAi}</CardTitle>
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
      </div>

      {filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 rounded-xl border-2 border-dashed bg-muted/20">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div>
            <h3 className="text-lg font-semibold">✓ Tudo categorizado</h3>
            <p className="text-muted-foreground">Não existem lançamentos sem categoria neste perfil/período.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox 
                    checked={selectedRows.length === filteredData.length && filteredData.length > 0}
                    onCheckedChange={(checked) => {
                      setSelectedRows(checked ? filteredData.map(r => r.id) : []);
                    }}
                  />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Favorecido / De-Para</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Banco / Cartão</TableHead>
                <TableHead>Categoria atual</TableHead>
                <TableHead>Sugestão da IA</TableHead>
                <TableHead>Confiança</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((row) => (
                <TableRow key={row.id} className="group hover:bg-muted/50">
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
                  <TableCell className={row.amount && row.amount < 0 ? 'text-red-500 font-semibold' : 'text-blue-500 font-semibold'}>
                    {currencyBRL(Math.abs(row.amount || 0))}
                  </TableCell>
                  <TableCell className="text-xs">{(row.financial_profiles as any)?.name || '—'}</TableCell>
                  <TableCell className="text-xs">{row.bank_name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-normal border-destructive/20 text-destructive">
                      { (row.categories as any)?.name || 'Sem categoria' }
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.ai_suggested_category_id ? (
                      <div className="flex items-center gap-1.5 text-blue-600 font-medium text-xs">
                        <BrainCircuit className="h-3 w-3" />
                        {allCategories?.find(c => c.id === row.ai_suggested_category_id)?.name || 'Sugerido'}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Sem sugestão</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.ai_confidence && (
                       <span className={cn(
                         "text-[10px] font-bold px-1.5 py-0.5 rounded",
                         Number(row.ai_confidence) > 0.8 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                       )}>
                         {(Number(row.ai_confidence) * 100).toFixed(0)}%
                       </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                       {row.ai_suggested_category_id && (
                         <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2"
                          disabled={updateCategoryMutation.isPending}
                          onClick={() => {
                            if (confirm(`Categorizar este lançamento como ${allCategories?.find(c => c.id === row.ai_suggested_category_id)?.name}?`)) {
                              updateCategoryMutation.mutate({ 
                                receiptId: row.id, 
                                categoryId: row.ai_suggested_category_id!,
                                method: 'ai_suggested'
                              });
                            }
                          }}
                        >
                          Usar Sugestão
                        </Button>
                       )}
                       
                       <CategoryPicker 
                        categories={allCategories || []} 
                        onSelect={(catId) => {
                          const catName = allCategories?.find(c => c.id === catId)?.name;
                          if (confirm(`Categorizar este lançamento como ${catName}?`)) {
                            updateCategoryMutation.mutate({ 
                              receiptId: row.id, 
                              categoryId: catId, 
                              method: 'manual' 
                            });
                          }
                        }} 
                        isLoading={updateCategoryMutation.isPending}
                       />

                       <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate({ to: '/app/vault', search: (s: any) => ({ ...s, receipt: row.id }) })}>
                            <Eye className="mr-2 h-4 w-4" /> Ver comprovante
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 z-50">
          <span className="text-sm font-semibold">{selectedRows.length} selecionados</span>
          <div className="h-4 w-px bg-border" />
          <CategoryPicker 
            categories={allCategories || []} 
            trigger={<Button size="sm">Categorizar selecionados</Button>}
            onSelect={(catId) => {
              const catName = allCategories?.find(c => c.id === catId)?.name;
              if (confirm(`Você deseja categorizar ${selectedRows.length} lançamentos como ${catName}?`)) {
                Promise.all(selectedRows.map(id => updateCategoryMutation.mutateAsync({ 
                  receiptId: id, 
                  categoryId: catId, 
                  method: 'manual' 
                }))).then(() => {
                  setSelectedRows([]);
                });
              }
            }}
            isLoading={updateCategoryMutation.isPending}
          />
          <Button size="sm" variant="ghost" onClick={() => setSelectedRows([])}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

function CategoryPicker({ categories, onSelect, isLoading, trigger }: { 
  categories: { id: string, name: string }[], 
  onSelect: (id: string) => void,
  isLoading: boolean,
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 gap-2 px-2" disabled={isLoading}>
            <Tags className="h-3.5 w-3.5" />
            Definir Categoria
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 shadow-2xl" align="end">
        <Command className="rounded-lg border shadow-md">
          <CommandInput placeholder="Pesquisar categoria..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup heading="Categorias Reais">
              {categories.map((cat) => (
                <CommandItem
                  key={cat.id}
                  value={cat.name}
                  onSelect={() => {
                    onSelect(cat.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4 opacity-0")} />
                  {cat.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
