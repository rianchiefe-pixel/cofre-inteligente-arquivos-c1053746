import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function NewReceiptDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    transaction_type: "gasto_variavel",
    payment_method: "dinheiro",
    nature: "despesa",
    profile_id: "",
    category_id: "",
    property_id: "",
    recipient_name: "",
    recipient_tax_id: "",
    auth_code: "",
    bank_name: "",
    bank_account: "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [catPopoverOpen, setCatPopoverOpen] = useState(false);

  const qc = useQueryClient();

  // Queries
  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_profiles").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: categories, refetch: refetchCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, archived")
        .eq("archived", false)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: properties, isLoading: loadingProperties } = useQuery({
    queryKey: ["properties", formData.profile_id],
    queryFn: async () => {
      if (!formData.profile_id) return [];
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, profile_id")
        .eq("profile_id", formData.profile_id)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!formData.profile_id,
  });

  // Default profile selection
  useEffect(() => {
    if (isOpen && !formData.profile_id && profiles?.length) {
      const personal = profiles.find(p => p.name.toLowerCase().includes('pessoal'));
      setFormData(prev => ({ ...prev, profile_id: personal?.id || profiles[0].id }));
    }
  }, [isOpen, profiles]);

  // Handle profile change
  const handleProfileChange = (profileId: string) => {
    setFormData(prev => ({
      ...prev,
      profile_id: profileId,
      property_id: "",
    }));
  };

  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    return categories.filter(c => 
      c.name.toLowerCase().includes(catSearch.toLowerCase())
    );
  }, [categories, catSearch]);

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setIsCreatingCat(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase.from("categories").insert({
        name: newCatName.trim(),
        user_id: user.id,
        default_type: formData.transaction_type as any,
      }).select().single();

      if (error) throw error;
      
      toast.success("Categoria criada!");
      await refetchCategories();
      setFormData(prev => ({ ...prev, category_id: data.id }));
      setNewCatName("");
      setCatPopoverOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar categoria");
    } finally {
      setIsCreatingCat(false);
    }
  };

  const handleSave = async () => {
    if (!formData.payment_date) return toast.error("Data é obrigatória");
    if (!formData.amount) return toast.error("Valor é obrigatório");
    if (!formData.recipient_name && !formData.description) return toast.error("Destinatário ou descrição é obrigatório");
    if (!formData.profile_id) return toast.error("Perfil financeiro é obrigatório");
    if (!formData.transaction_type) return toast.error("Tipo de gasto é obrigatório");
    if (!formData.category_id) return toast.error("Categoria é obrigatória");
    if (!formData.payment_method) return toast.error("Forma de pagamento é obrigatória");

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const amountNum = parseFloat(formData.amount.replace(".", "").replace(",", "."));
      if (isNaN(amountNum)) throw new Error("Valor inválido");

      const { error } = await supabase.from("receipts").insert({
        user_id: user.id,
        description: formData.description,
        amount: amountNum,
        payment_date: formData.payment_date,
        transaction_type: formData.transaction_type as any,
        payment_method: formData.payment_method as any,
        status: "approved",
        profile_id: formData.profile_id,
        category_id: formData.category_id,
        property_id: formData.property_id === "none" ? null : (formData.property_id || null),
        recipient_name: formData.recipient_name,
        recipient_tax_id: formData.recipient_tax_id || null,
        auth_code: formData.auth_code || null,
        bank_name: formData.bank_name || null,
        notes: formData.notes || null,
        expense_behavior: formData.transaction_type === "gasto_fixo" ? "fixed" : (formData.transaction_type === "gasto_variavel" ? "variable" : null)
      });
      
      if (error) throw error;
      toast.success("Lançamento salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["receipts"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar lançamento.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b">
          <DialogTitle>Novo Lançamento</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-8 pb-12">
            {/* Seção 1: Dados do lançamento */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Dados do lançamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={formData.payment_date} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input type="text" value={formData.amount} placeholder="0,00" onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Destinatário *</Label>
                  <Input value={formData.recipient_name} placeholder="Ex: Supermercado X" onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CPF/CNPJ (Opcional)</Label>
                  <Input value={formData.recipient_tax_id} placeholder="00.000.000/0001-00" onChange={(e) => setFormData({ ...formData, recipient_tax_id: e.target.value })} />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>Descrição *</Label>
                  <Input value={formData.description} placeholder="Ex: Compra mensal de limpeza" onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Seção 2: Pagamento */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Pagamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Forma de Pagamento *</Label>
                  <Select value={formData.payment_method} onValueChange={(v) => setFormData({ ...formData, payment_method: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="credito_vista">Cartão de Crédito</SelectItem>
                      <SelectItem value="debito">Cartão de Débito</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="outro">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Código de Autenticação (Opcional)</Label>
                  <Input value={formData.auth_code} placeholder="Código do comprovante" onChange={(e) => setFormData({ ...formData, auth_code: e.target.value })} />
                </div>

                {formData.payment_method !== "dinheiro" && (
                  <>
                    <div className="space-y-2">
                      <Label>Banco (Opcional)</Label>
                      <Input value={formData.bank_name} placeholder="Nome do banco" onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Conta (Opcional)</Label>
                      <Input value={formData.bank_account} placeholder="Número da conta" onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
            </section>
            
            {/* Seção 3: Classificação & Vínculos */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Classificação & Vínculos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Perfil Financeiro */}
                <div className="space-y-2">
                  <Label>Perfil financeiro *</Label>
                  <Select value={formData.profile_id} onValueChange={handleProfileChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tipo de Gasto */}
                <div className="space-y-2">
                  <Label>Tipo de gasto *</Label>
                  <Select value={formData.transaction_type} onValueChange={(v) => setFormData({ ...formData, transaction_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gasto_fixo">Fixo</SelectItem>
                      <SelectItem value="gasto_variavel">Variável</SelectItem>
                      <SelectItem value="pessoal">Não definido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Categoria */}
                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <div className="flex gap-2">
                    <Popover open={catPopoverOpen} onOpenChange={setCatPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal">
                          {formData.category_id 
                            ? categories?.find(c => c.id === formData.category_id)?.name 
                            : "Selecionar categoria..."}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <div className="p-2 border-b">
                          <Input 
                            placeholder="Pesquisar categoria..." 
                            value={catSearch}
                            onChange={(e) => setCatSearch(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <ScrollArea className="h-[200px]">
                          <div className="p-1">
                            {filteredCategories.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma categoria encontrada.</div>
                            ) : (
                              filteredCategories.map(cat => (
                                <Button
                                  key={cat.id}
                                  variant="ghost"
                                  className="w-full justify-start font-normal text-left h-auto py-2"
                                  onClick={() => {
                                    setFormData(prev => ({ ...prev, category_id: cat.id }));
                                    setCatPopoverOpen(false);
                                  }}
                                >
                                  {cat.name}
                                </Button>
                              ))
                            )}
                          </div>
                        </ScrollArea>
                        <div className="p-2 border-t bg-muted/20">
                          <div className="flex gap-2">
                            <Input 
                              placeholder="Nova categoria..." 
                              value={newCatName}
                              onChange={(e) => setNewCatName(e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Button size="sm" className="h-8" onClick={handleCreateCategory} disabled={isCreatingCat || !newCatName.trim()}>
                              {isCreatingCat ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Imóvel Vinculado */}
                <div className="space-y-2">
                  <Label>Imóvel vinculado (Opcional)</Label>
                  <Select value={formData.property_id} onValueChange={(v) => setFormData({ ...formData, property_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingProperties ? "Carregando imóveis..." : "Nenhum"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {properties?.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground">Nenhum imóvel cadastrado para este perfil.</div>
                      ) : (
                        properties?.map(prop => (
                          <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Natureza */}
                <div className="space-y-2">
                  <Label>Natureza</Label>
                  <div className="h-10 px-3 py-2 border rounded-md bg-muted/30 text-sm flex items-center">
                    Despesa
                  </div>
                </div>
              </div>
            </section>

            {/* Seção 4: Comprovante */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Comprovante (opcional)</h3>
              <div className="border-2 border-dashed rounded-xl p-8 text-center bg-muted/10 hover:bg-muted/20 transition-colors cursor-pointer border-muted-foreground/20">
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 bg-background rounded-full border shadow-sm">
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium">Anexar comprovante</div>
                  <div className="text-xs text-muted-foreground">PDF, JPG, PNG (máx. 10MB)</div>
                </div>
              </div>
            </section>

            {/* Observações */}
            <section className="space-y-2">
              <Label>Observações (Opcional)</Label>
              <Input value={formData.notes} placeholder="Notas adicionais sobre o lançamento" onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </section>
          </div>
        </ScrollArea>
        
        <DialogFooter className="p-6 border-t bg-muted/10">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading} className="min-w-[150px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar lançamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
