import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { parseBrlAmountToCents, centsToNumber } from "@/lib/format";

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
    bank_id: "",
    account_id: "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [catPopoverOpen, setCatPopoverOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

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
        .neq("status", "vendido")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!formData.profile_id,
  });

  const { data: banks } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts", formData.profile_id, formData.bank_id],
    queryFn: async () => {
      if (!formData.profile_id) return [];
      let query = supabase
        .from("accounts")
        .select("id, nickname, bank_id, profile_id")
        .eq("profile_id", formData.profile_id);
      
      if (formData.bank_id && formData.bank_id !== "none") {
        query = query.eq("bank_id", formData.bank_id);
      }

      const { data, error } = await query.order("nickname");
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
      bank_id: "",
      account_id: "",
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.size > 10 * 1024 * 1024) {
        toast.error("Arquivo muito grande (máx 10MB)");
        return;
      }
      setFile(selected);
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

      const cents = parseBrlAmountToCents(formData.amount);
      if (cents === null) throw new Error("Valor inválido");
      const amountNum = centsToNumber(cents);

      let filePath = null;
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const path = `${user.id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(path, file);
        
        if (uploadError) throw uploadError;
        filePath = path;
      }

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
        auth_code: formData.payment_method === "dinheiro" ? null : (formData.auth_code || null),
        bank_name: formData.payment_method === "dinheiro" ? null : (formData.bank_name || null),
        bank_id: formData.payment_method === "dinheiro" || formData.bank_id === "none" ? null : (formData.bank_id || null),
        account_id: formData.payment_method === "dinheiro" || formData.account_id === "none" ? null : (formData.account_id || null),
        notes: formData.notes || null,
        expense_behavior: formData.transaction_type === "gasto_fixo" ? "fixed" : (formData.transaction_type === "gasto_variavel" ? "variable" : null),
        file_path: filePath,
        file_name: file?.name || null,
        file_mime: file?.type || null,
        file_size: file?.size || null,
      });
      
      if (error) throw error;
      toast.success("Lançamento salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["receipts"] });
      onClose();
      // Reset form
      setFormData({
        description: "",
        amount: "",
        payment_date: new Date().toISOString().split("T")[0],
        transaction_type: "gasto_variavel",
        payment_method: "dinheiro",
        nature: "despesa",
        profile_id: profiles?.[0]?.id || "",
        category_id: "",
        property_id: "",
        recipient_name: "",
        recipient_tax_id: "",
        auth_code: "",
        bank_name: "",
        bank_account: "",
        bank_id: "",
        account_id: "",
        notes: "",
      });
      setFile(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar lançamento.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b shrink-0">
          <DialogTitle>Novo Lançamento</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-8 pb-12">
            {/* 1. Dados do lançamento */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Dados do lançamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={formData.payment_date} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input 
                    type="text" 
                    value={formData.amount} 
                    placeholder="0,00" 
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, "");
                      if (val === "") {
                        setFormData({ ...formData, amount: "" });
                        return;
                      }
                      const cents = parseInt(val, 10);
                      const formatted = (cents / 100).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });
                      setFormData({ ...formData, amount: formatted });
                    }} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Destinatário *</Label>
                  <Input value={formData.recipient_name} placeholder="Ex: Supermercado X" onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CPF/CNPJ (Opcional)</Label>
                  <Input 
                    value={formData.recipient_tax_id} 
                    placeholder="00.000.000/0000-00" 
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 11) {
                        val = val.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                      } else {
                        val = val.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
                      }
                      setFormData({ ...formData, recipient_tax_id: val.slice(0, 18) });
                    }} 
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>Descrição *</Label>
                  <Input value={formData.description} placeholder="Ex: Compra mensal de limpeza" onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>Observações (Opcional)</Label>
                  <Textarea value={formData.notes} placeholder="Notas adicionais sobre o lançamento" onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="resize-none" />
                </div>
              </div>
            </section>

            {/* 2. Pagamento */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Pagamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Forma de Pagamento *</Label>
                  <Select value={formData.payment_method} onValueChange={(v) => {
                    const updates: any = { payment_method: v };
                    if (v === "dinheiro") {
                      updates.auth_code = "";
                      updates.bank_name = "";
                      updates.bank_id = "";
                      updates.account_id = "";
                    }
                    setFormData({ ...formData, ...updates });
                  }}>
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
                      <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                      <SelectItem value="outro">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.payment_method !== "dinheiro" && (
                  <>
                    <div className="space-y-2">
                      <Label>Código de Autenticação (Opcional)</Label>
                      <Input value={formData.auth_code} placeholder="Código do comprovante" onChange={(e) => setFormData({ ...formData, auth_code: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Banco informado no comprovante (Opcional)</Label>
                      <Input value={formData.bank_name} placeholder="Nome do banco no papel" onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Banco cadastrado no Meu Cofre (Opcional)</Label>
                      <Select value={formData.bank_id} onValueChange={(v) => setFormData({ ...formData, bank_id: v, account_id: "" })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o banco" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {banks?.map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Conta utilizada (Opcional)</Label>
                      <Select value={formData.account_id} onValueChange={(v) => setFormData({ ...formData, account_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder={!formData.profile_id ? "Selecione o perfil primeiro" : "Selecione a conta"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {accounts?.length === 0 ? (
                            <div className="p-2 text-xs text-muted-foreground text-center">Nenhuma conta compatível com o banco e o perfil selecionados.</div>
                          ) : (
                            accounts?.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            </section>
            
            {/* 3. Classificação */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Classificação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                <div className="space-y-2">
                  <Label>Categoria *</Label>
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

                <div className="space-y-2">
                  <Label>Natureza</Label>
                  <div className="h-9 px-3 py-2 border rounded-md bg-muted/30 text-sm flex items-center text-muted-foreground select-none">
                    Despesa
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Vínculos do Meu Cofre */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Vínculos do Meu Cofre</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                <div className="space-y-2">
                  <Label>Imóvel vinculado (Opcional)</Label>
                  <Select value={formData.property_id} onValueChange={(v) => setFormData({ ...formData, property_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingProperties ? "Carregando imóveis..." : "Nenhum"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {properties?.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground text-center">Nenhum imóvel cadastrado para este perfil.</div>
                      ) : (
                        properties?.map(prop => (
                          <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* 5. Comprovante opcional */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2 uppercase tracking-wider">Comprovante (opcional)</h3>
              <div className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                file ? "bg-primary/5 border-primary/40" : "bg-muted/10 border-muted-foreground/20 hover:bg-muted/20"
              )} onClick={() => document.getElementById("file-upload")?.click()}>
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  accept=".pdf,image/jpeg,image/jpg,image/png"
                  onChange={handleFileChange}
                />
                <div className="flex flex-col items-center gap-2">
                  <div className={cn(
                    "p-3 rounded-full border shadow-sm",
                    file ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                  )}>
                    {file ? <CheckCircle2 className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
                  </div>
                  <div className="text-sm font-medium">
                    {file ? file.name : "Clique para selecionar ou arraste o arquivo"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF, JPG, PNG (máx. 10MB)"}
                  </div>
                  {file && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-2 text-xs text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      Remover arquivo
                    </Button>
                  )}
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
        
        <DialogFooter className="p-6 border-t bg-muted/5 shrink-0">
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

const CheckCircle2 = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
