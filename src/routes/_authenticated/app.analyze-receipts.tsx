import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AnalysisUpload } from "@/components/receipt-analysis/analysis-upload";
import { AnalysisResults } from "@/components/receipt-analysis/analysis-results";
import { Button } from "@/components/ui/button";
import { ChevronLeft, FileArchive, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/analyze-receipts")({
  head: () => ({ meta: [{ title: "Analisar Comprovantes — Meu Cofre" }] }),
  component: AnalyzeReceiptsPage,
});

function AnalyzeReceiptsPage() {
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["analysis_history"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("receipt_analysis_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !activeBatchId || showHistory
  });

  if (activeBatchId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setActiveBatchId(null)} className="gap-2">
            <ChevronLeft className="h-4 w-4" /> Voltar para o início
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileArchive className="h-4 w-4" /> Lote: {activeBatchId.slice(0, 8)}
          </div>
        </div>
        <AnalysisResults batchId={activeBatchId} />
      </div>
    );
  }

  return (
    <div className="space-y-12 max-w-4xl mx-auto">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Analisar Comprovantes</h1>
        <p className="text-lg text-muted-foreground">
          Envie um ZIP e descubra quais comprovantes já estão lançados no Meu Cofre.
        </p>
      </div>

      <AnalysisUpload onComplete={setActiveBatchId} />

      {history && history.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-bold">Análises recentes</h2>
          </div>
          <div className="grid gap-4">
            {history.map(batch => (
              <Card 
                key={batch.id} 
                className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setActiveBatchId(batch.id)}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium">{batch.file_name}</p>
                    <p className="text-xs text-muted-foreground">{dateBR(batch.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Total</p>
                      <p className="font-bold">{batch.files_total}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-blue-600 uppercase font-semibold">Já lançados</p>
                      <p className="font-bold text-blue-700">{batch.already_found}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-green-600 uppercase font-semibold">Não localizados</p>
                      <p className="font-bold text-green-700">{batch.not_found}</p>
                    </div>
                    <Button variant="ghost" size="sm">Abrir</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="bg-muted/50 p-6 rounded-xl border border-border space-y-4">
        <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Como funciona?</h3>
        <div className="grid md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <p className="font-semibold">1. Envio Seguro</p>
            <p className="text-muted-foreground">O sistema lê seu ZIP temporariamente. Nada é lançado no Cofre automaticamente.</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">2. Busca Inteligente</p>
            <p className="text-muted-foreground">Cruzamos dados dos arquivos com seus lançamentos reais por hash, valor, data e IA.</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">3. Resultado e Download</p>
            <p className="text-muted-foreground">Você baixa apenas o que NÃO foi encontrado para processar no fluxo normal depois.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
