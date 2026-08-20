import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function NewReceiptDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    transaction_type: "gasto_variavel",
    payment_method: "dinheiro",
    nature: "despesa",
    profile_id: "pessoal",
    recipient: "",
  });
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase.from("receipts").insert({
        user_id: user.id,
        description: formData.description,
        amount: parseFloat(formData.amount.replace(",", ".")),
        payment_date: formData.payment_date,
        transaction_type: formData.transaction_type as any,
        payment_method: formData.payment_method as any,
        status: "approved",
      });
      if (error) throw error;
      toast.success("Lançamento salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["receipts", "no-receipt"] });
      onClose();
    } catch (e) {
      toast.error("Erro ao salvar lançamento.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Novo Lançamento</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] p-1">
          <div className="space-y-6 p-4">
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2">Dados do lançamento</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={formData.payment_date} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input type="text" value={formData.amount} placeholder="0,00" onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Destinatário</Label>
                <Input value={formData.recipient} onChange={(e) => setFormData({ ...formData, recipient: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2">Pagamento</h3>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
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
                    <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                    <SelectItem value="outro">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.payment_method !== "dinheiro" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Banco</Label>
                    <Input placeholder="Opcional" />
                  </div>
                  <div className="space-y-2">
                    <Label>Conta</Label>
                    <Input placeholder="Opcional" />
                  </div>
                </div>
              )}
            </section>
            
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2">Classificação & Vínculos</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Natureza</Label>
                  <Select value={formData.nature} onValueChange={(v) => setFormData({ ...formData, nature: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={formData.profile_id} onValueChange={(v) => setFormData({ ...formData, profile_id: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pessoal">Pessoal</SelectItem>
                      <SelectItem value="holding">Holding</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
            
            <section className="space-y-4 border rounded p-4 bg-muted/20">
              <h3 className="font-semibold text-sm text-muted-foreground">Comprovante (opcional)</h3>
              <div className="border-2 border-dashed rounded p-4 text-center cursor-pointer hover:border-primary">
                Arraste ou clique para anexar PDF/Imagem
              </div>
            </section>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>Salvar lançamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
