import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Search,
  ArrowRightLeft,
  Calendar,
  User,
  CreditCard,
  History,
  Info
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currencyBRL, dateBR } from "@/lib/format";
import { useState, useEffect } from "react";

interface AnalysisCompareDialogProps {
  file: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnalysisCompareDialog({ file, open, onOpenChange }: AnalysisCompareDialogProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  // 1. Buscar a URL do arquivo de análise
  useEffect(() => {
    if (open && file?.storage_path) {
      supabase.storage
        .from("receipts")
        .createSignedUrl(file.storage_path, 3600)
        .then(({ data }) => setFileUrl(data?.signedUrl || null));
    }
  }, [open, file]);

  // 2. Buscar dados do recibo candidato no Cofre
  const { data: candidate, isLoading: isCandidateLoading } = useQuery({
    queryKey: ["receipt_candidate", file?.candidate_receipt_id],
    queryFn: async () => {
      if (!file?.candidate_receipt_id) return null;
      const { data, error } = await supabase
        .from("receipts")
        .select(`
          *,
          category:categories(name),
          profile:financial_profiles(name),
          bank:banks(name),
          property:properties(name)
        `)
        .eq("id", file.candidate_receipt_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!file?.candidate_receipt_id && open
  });

  const [candidateFileUrl, setCandidateFileUrl] = useState<string | null>(null);
  
  // 3. Buscar a URL do arquivo do candidato
  useEffect(() => {
    if (open && candidate?.file_path) {
      supabase.storage
        .from("receipts")
        .createSignedUrl(candidate.file_path, 3600)
        .then(({ data }) => setCandidateFileUrl(data?.signedUrl || null));
    }
  }, [open, candidate]);

  if (!file) return null;

  const diff = (field: string) => {
    const isDifferent = file.different_fields?.includes(field);
    return isDifferent ? "text-red-600 font-bold bg-red-50 px-1 rounded" : "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-xl flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
                Comparar Comprovante
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Cruzamento entre o arquivo do ZIP e o lançamento encontrado no Cofre.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={file.similarity_score >= 90 ? "default" : "secondary"} className="h-7 text-sm px-3">
                Score: {file.similarity_score}%
              </Badge>
              {file.analysis_status === 'already_posted' ? (
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none h-7 px-3">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Já Lançado
                </Badge>
              ) : (
                <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-none h-7 px-3">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Revisar
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
          {/* Lado Esquerdo: Arquivo do ZIP */}
          <div className="border-r flex flex-col overflow-hidden bg-muted/20">
            <div className="p-3 bg-white border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold truncate max-w-[200px]">{file.file_name}</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">ORIGEM: ZIP</span>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="h-2/3 border-b bg-black/5 flex items-center justify-center p-4 relative">
                {fileUrl ? (
                  <iframe src={fileUrl} className="w-full h-full border-none rounded shadow-sm" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-xs">Carregando visualização...</p>
                  </div>
                )}
              </div>
              
              <ScrollArea className="flex-1 p-4 bg-white">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                    <Search className="h-3.5 w-3.5" /> Dados Extraídos
                  </h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase font-medium">Valor</label>
                      <p className={`text-sm font-semibold ${diff('amount')}`}>{file.amount ? currencyBRL(file.amount) : '—'}</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase font-medium">Data</label>
                      <p className={`text-sm font-semibold ${diff('payment_date')}`}>{file.payment_date ? dateBR(file.payment_date) : '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase font-medium">Destinatário</label>
                      <p className={`text-sm font-semibold ${diff('recipient_name')}`}>{file.recipient_name || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase font-medium">Motivo da Análise</label>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{file.analysis_reason}</p>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Lado Direito: Lançamento no Cofre */}
          <div className="flex flex-col overflow-hidden">
            <div className="p-3 bg-white border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Lançamento Identificado</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">ORIGEM: COFRE</span>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              {isCandidateLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Buscando detalhes no Cofre...</p>
                </div>
              ) : candidate ? (
                <>
                  <div className="h-2/3 border-b bg-black/5 flex items-center justify-center p-4">
                    {candidateFileUrl ? (
                      <iframe src={candidateFileUrl} className="w-full h-full border-none rounded shadow-sm" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-12 w-12 opacity-20" />
                        <p className="text-xs italic">Visualização não disponível</p>
                      </div>
                    )}
                  </div>
                  
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5" /> Dados Registrados
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Valor no Lançamento</label>
                          <p className="text-sm font-semibold">{candidate.amount ? currencyBRL(candidate.amount) : '—'}</p>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Data do Pagamento</label>
                          <p className="text-sm font-semibold">{candidate.payment_date ? dateBR(candidate.payment_date) : '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Destinatário Registrado</label>
                          <p className="text-sm font-semibold">{candidate.recipient_name || '—'}</p>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Perfil</label>
                          <p className="text-xs">{candidate.profile?.name || '—'}</p>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Categoria</label>
                          <p className="text-xs">{candidate.category?.name || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <AlertTriangle className="h-12 w-12 text-yellow-500 opacity-50" />
                  <div className="space-y-2">
                    <p className="font-bold">Lançamento não encontrado</p>
                    <p className="text-sm text-muted-foreground">
                      O ID do candidato pode ter sido removido ou o registro está inacessível.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-muted/10 border-t flex justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar Comparação</Button>
          {file.analysis_status === 'possible_match' && (
            <Button className="bg-primary hover:bg-primary/90">Confirmar Correspondência</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { FileArchive, Loader2 } from "lucide-react";
