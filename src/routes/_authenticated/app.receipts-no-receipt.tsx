import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ConferenceDialog } from "@/components/vault/conference-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/receipts-no-receipt")({
  component: NoReceiptsPage,
});

function NoReceiptsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const qc = useQueryClient();

  const { data: receipts, isLoading } = useQuery({
    queryKey: ["receipts", "no-receipt"],
    queryFn: async () => {
      return (
        await supabase
          .from("receipts")
          .select("*")
          .is("storage_path", null)
          .order("payment_date", { ascending: false })
      ).data ?? [];
    },
  });

  const handleCreateNew = () => {
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Lançamentos sem comprovante</h1>
        <Button onClick={handleCreateNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo lançamento
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10">Carregando...</TableCell>
              </TableRow>
            ) : receipts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10">Nenhum lançamento sem comprovante encontrado.</TableCell>
              </TableRow>
            ) : (
              receipts?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.payment_date}</TableCell>
                  <TableCell>{r.description || "Sem descrição"}</TableCell>
                  <TableCell>{r.amount}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm">Anexar comprovante</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      
      {/* 
        NOTE: A modal de criação real deve ser adaptada da ConferenceDialog ou 
        um formulário equivalente. Para a implementação imediata da ação de clique:
      */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-[500px] p-6 space-y-4">
            <h2 className="text-lg font-bold">Novo lançamento</h2>
            <p>Formulário de cadastro será implementado aqui.</p>
            <Button onClick={() => setIsDialogOpen(false)}>Fechar</Button>
          </Card>
        </div>
      )}
    </div>
  );
}
