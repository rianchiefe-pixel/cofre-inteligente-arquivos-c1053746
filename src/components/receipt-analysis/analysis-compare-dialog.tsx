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
  Info,
  Link,
  Loader2,
  FileArchive
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currencyBRL, dateBR } from "@/lib/format";
import { useState, useEffect } from "react";
import { linkReceiptToAnalysisFile } from "@/lib/link-receipt.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

interface AnalysisCompareDialogProps {
  file: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function resolveMimeType(file: any): string {
  if (file.mime_type) return file.mime_type;
  const ext = file.extension || file.file_name?.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

export function AnalysisCompareDialog({ file, open, onOpenChange }: AnalysisCompareDialogProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [viewerStatus, setViewerStatus] = useState<"idle" | "loading" | "success" | "no_file" | "error">("idle");
  const [candidateFileUrl, setCandidateFileUrl] = useState<string | null>(null);
  const [candidateStatus, setCandidateStatus] = useState<"loading" | "success" | "no_candidate" | "not_found" | "error">("loading");
  
  const queryClient = useQueryClient();
  const linkReceiptFn = useServerFn(linkReceiptToAnalysisFile);

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!file?.candidate_receipt_id) throw new Error("ID do lançamento não informado");
      return linkReceiptFn({
        data: {
          analysisFileId: file.id,
          receiptId: file.candidate_receipt_id
        }
      });
    },
    onSuccess: () => {
      toast.success("Comprovante vinculado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["analysis_files", file.batch_id] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Erro ao vincular: ${err instanceof Error ? err.message : "Desconhecido"}`);
    }
  });

  // 1. Resetar estado ao trocar de arquivo (Regra 24)
  useEffect(() => {
    if (open) {
      setFileUrl(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
      setViewerStatus("idle");
      setCandidateFileUrl(null);
      setCandidateStatus("loading");
    }
  }, [open, file?.id]);

  // 2. Buscar a URL do arquivo de análise (Regra 3, 4, 5, 27, 7, 8)
  useEffect(() => {
    if (!open || !file?.id) return;
    
    let cancelled = false;
    let timeoutId: any = null;
    let currentObjectUrl: string | null = null;

    async function loadAnalysisFile() {
      if (!file?.storage_path) {
        setViewerStatus("no_file");
        return;
      }

      setViewerStatus("loading");
      
      // Timeout de segurança (Regra 2)
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          console.error("[ANALYZE VIEWER] Timeout no carregamento");
          setViewerStatus("error");
        }
      }, 15000);

      try {
        const effectiveMime = resolveMimeType(file);
        console.log("[ANALYZE VIEWER]", {
          analysisFileId: file.id,
          fileName: file.file_name,
          storagePath: file.storage_path,
          mimeType: file.mime_type,
          effectiveMime
        });

        const { data, error } = await supabase.storage
          .from("receipts")
          .createSignedUrl(file.storage_path, 3600);

        if (cancelled) return;

        if (error || !data?.signedUrl) {
          console.error("[ANALYZE VIEWER] Signed URL Fail:", error);
          setViewerStatus("error");
          return;
        }

        setFileUrl(data.signedUrl);

        // Baixar como Blob para visualização robusta (Regra 7)
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const originalBlob = await response.blob();
        const displayBlob = new Blob([await originalBlob.arrayBuffer()], { type: effectiveMime });
        currentObjectUrl = URL.createObjectURL(displayBlob);

        if (!cancelled) {
          setObjectUrl(currentObjectUrl);
          setViewerStatus("success");
        } else {
          URL.revokeObjectURL(currentObjectUrl);
        }
      } catch (err) {
        console.error("[ANALYZE VIEWER] Error:", err);
        if (!cancelled) setViewerStatus("error");
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    loadAnalysisFile();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [open, file?.id, file?.storage_path]);

  // 3. Buscar dados do recibo candidato (Regra 11, 13, 14, 18)
  const { data: candidate, error: candidateError } = useQuery({
    queryKey: ["receipt_candidate", file?.candidate_receipt_id],
    queryFn: async () => {
      if (!file?.candidate_receipt_id) return null;
      const { data, error } = await supabase
        .from("receipts")
        .select(`
          *,
          category:categories!receipts_category_id_fkey(name),
          profile:financial_profiles!receipts_profile_id_fkey(name),
          bank:banks!receipts_bank_id_fkey(name),
          property:properties!receipts_property_id_fkey(name)
        `)
        .eq("id", file.candidate_receipt_id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!file?.candidate_receipt_id && open
  });

  useEffect(() => {
    if (!open) return;
    if (!file?.candidate_receipt_id) {
      setCandidateStatus("no_candidate");
      return;
    }

    if (candidate) {
      setCandidateStatus("success");
      // Buscar arquivo do candidato se existir
      if (candidate.file_path) {
        supabase.storage
          .from("receipts")
          .createSignedUrl(candidate.file_path, 3600)
          .then(({ data }) => setCandidateFileUrl(data?.signedUrl || null));
      }
    } else if (candidate === null) {
      setCandidateStatus("not_found");
    } else if (candidateError) {
      setCandidateStatus("error");
    }
  }, [open, candidate, candidateError, file?.candidate_receipt_id]);

  if (!file) return null;

  const hasScore = typeof file.similarity_score === 'number' && Number.isFinite(file.similarity_score);

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
              {hasScore && (
                <Badge variant={file.similarity_score >= 90 ? "default" : "secondary"} className="h-7 text-sm px-3">
                  Score: {file.similarity_score}%
                </Badge>
              )}
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
                {viewerStatus === "loading" ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-xs">Carregando visualização...</p>
                  </div>
                ) : viewerStatus === "success" && fileUrl ? (
                  <div className="w-full h-full p-2 overflow-auto">
                    {file.mime_type?.includes("pdf") ? (
                      <iframe 
                        src={fileUrl} 
                        className="w-full h-full border-none rounded shadow-sm"
                        onLoad={() => console.log("[ANALYZE VIEWER] PDF Loaded")}
                      />
                    ) : (
                      <img 
                        src={fileUrl} 
                        className="max-w-full h-auto mx-auto rounded shadow-sm" 
                        onLoad={() => console.log("[ANALYZE VIEWER] Image Loaded")}
                        onError={() => setViewerStatus("error")}
                      />
                    )}
                  </div>
                ) : viewerStatus === "no_file" ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground p-8 text-center">
                    <FileText className="h-12 w-12 opacity-20" />
                    <p className="text-sm font-medium">Sem arquivo anexado</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-muted-foreground p-8 text-center">
                    <AlertTriangle className="h-10 w-10 text-yellow-500 opacity-50" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Não foi possível carregar a visualização</p>
                      <div className="flex gap-2 justify-center mt-2">
                        <Button variant="outline" size="sm" onClick={() => window.open(fileUrl || "", "_blank")} disabled={!fileUrl}>
                          Abrir em nova aba
                        </Button>
                      </div>
                    </div>
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
                      <p className={`text-sm font-semibold ${file.different_fields?.includes('amount') ? "text-red-600 font-bold bg-red-50 px-1 rounded" : ""}`}>
                        {file.amount ? currencyBRL(file.amount) : '—'}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase font-medium">Data</label>
                      <p className={`text-sm font-semibold ${file.different_fields?.includes('payment_date') ? "text-red-600 font-bold bg-red-50 px-1 rounded" : ""}`}>
                        {file.payment_date ? dateBR(file.payment_date) : '—'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase font-medium">Destinatário</label>
                      <p className={`text-sm font-semibold ${file.different_fields?.includes('recipient_name') ? "text-red-600 font-bold bg-red-50 px-1 rounded" : ""}`}>
                        {file.recipient_name || '—'}
                      </p>
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
              {candidateStatus === "loading" ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Buscando detalhes no Cofre...</p>
                </div>
              ) : candidateStatus === "success" && candidate ? (
                <>
                  <div className="h-2/3 border-b bg-black/5 flex items-center justify-center p-4">
                    {candidateFileUrl ? (
                      <iframe src={candidateFileUrl} className="w-full h-full border-none rounded shadow-sm" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground p-8 text-center">
                        <FileText className="h-12 w-12 opacity-20" />
                        <p className="text-sm font-medium">Sem comprovante anexado</p>
                        <p className="text-xs italic">Este lançamento existe no Cofre, mas não possui um arquivo digitalizado vinculado.</p>
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
              ) : candidateStatus === "not_found" ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <AlertTriangle className="h-12 w-12 text-yellow-500 opacity-50" />
                  <div className="space-y-2">
                    <p className="font-bold">Lançamento não encontrado</p>
                    <p className="text-sm text-muted-foreground">
                      O registro associado a esta análise não foi localizado no Cofre.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <AlertTriangle className="h-12 w-12 text-red-500 opacity-50" />
                  <div className="space-y-2">
                    <p className="font-bold">Erro ao consultar o lançamento</p>
                    <p className="text-sm text-muted-foreground">
                      Não foi possível carregar os detalhes do candidato.
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
            <Button 
              className="bg-primary hover:bg-primary/90 gap-2"
              onClick={() => linkMutation.mutate()}
              disabled={linkMutation.isPending}
            >
              {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
              Vincular ao Lançamento
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


