import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function NewReceiptDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    transaction_type: "gasto_variavel",
    payment_method: "dinheiro",
  });
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from("receipts").insert({
        description: formData.description,
        amount: parseFloat(formData.amount),
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Lançamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={formData.payment_date} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} />
            </div>
          </div>
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
                <SelectItem value="outro">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>Salvar lançamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
