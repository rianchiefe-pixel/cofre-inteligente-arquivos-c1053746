import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Search, 
  Download, 
  FileText,
  Eye,
  GitCompareArrows,
  Loader2
} from "lucide-react";
import { currencyBRL, dateBR } from "@/lib/format";
import { toast } from "sonner";
import { downloadAnalysisZip } from "@/lib/receipt-analysis.functions";
import { useServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type Batch = {
  id: string;
  user_id: string;
  file_name: string;
  status: string;
  files_total: number;
  files_processed: number;
  already_found: number;
  not_found: number;
  needs_review: number;
  errors: number;
  created_at: string;
  finished_at: string | null;
};

type AnalysisFile = {
  id: string;
  batch_id: string;
  user_id: string;
  original_path: string;
  file_name: string;
  extension: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  content_hash: string | null;
  storage_path: string | null;
  extracted_text: string | null;
  ocr_data: any;
  ai_extracted_data: any;
  amount: number | null;
  payment_date: string | null;
  recipient_name: string | null;
  recipient_tax_id: string | null;
  bank_name: string | null;
  payment_method: string | null;
  auth_code: string | null;
  transaction_id: string | null;
  analysis_status: "processing" | "already_posted" | "not_found" | "possible_match" | "unreadable" | "duplicate_in_zip" | "error";
  candidate_receipt_id: string | null;
  similarity_score: number | null;
  matched_fields: string[] | null;
  different_fields: string[] | null;
  analysis_reason: string | null;
  created_at: string;
};

interface AnalysisResultsProps {
  batchId: string;
}

export function AnalysisResults({ batchId }: AnalysisResultsProps) {
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareFile, setCompareFile] = useState<AnalysisFile | null>(null);
  const downloadZipFn = useServerFn(downloadAnalysisZip);

  const { data: batch, isLoading: isBatchLoading } = useQuery({
    queryKey: ["analysis_batch", batchId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("receipt_analysis_batches")
        .select("*")
        .eq("id", batchId)
        .single();
      if (error) throw error;
      return data as Batch;
    },
    refetchInterval: (query) => {
      return query.state.data?.status === "processing" ? 2000 : false;
    }
  });

  const { data: files, isLoading: isFilesLoading } = useQuery({
    queryKey: ["analysis_files", batchId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("receipt_analysis_files")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AnalysisFile[];
    },
    refetchInterval: (query) => {
      return batch?.status === "processing" ? 2000 : false;
    }
  });

  const filteredFiles = useMemo(() => {
    if (!files) return [];
    return files.filter(f => {
      const matchesTab = 
        tab === "all" || 
        (tab === "not_found" && f.analysis_status === "not_found") ||
        (tab === "already_posted" && f.analysis_status === "already_posted") ||
        (tab === "possible_match" && f.analysis_status === "possible_match") ||
        (tab === "error" && f.analysis_status === "error");
      
      const matchesSearch = 
        !search || 
        f.file_name.toLowerCase().includes(search.toLowerCase()) ||
        f.recipient_name?.toLowerCase().includes(search.toLowerCase());
      
      return matchesTab && matchesSearch;
    });
  }, [files, tab, search]);

  const toggleAll = () => {
    // Somente não localizados podem ser selecionados (Regra 29)
    const notFoundFiles = filteredFiles.filter(f => f.analysis_status === "not_found");
    if (selectedIds.size === notFoundFiles.length && selectedIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notFoundFiles.map(f => f.id)));
    }
  };

  const handleDownload = async () => {
    const idsToDownload = selectedIds.size > 0 
      ? Array.from(selectedIds) 
      : files?.filter(f => f.analysis_status === "not_found").map(f => f.id) || [];
      
    if (idsToDownload.length === 0) return;
    
    const toastId = toast.loading(`Preparando ZIP com ${idsToDownload.length} arquivos...`);
    try {
      const urls = await downloadZipFn({ data: { fileIds: idsToDownload } });
      if (!urls.length) throw new Error("Nenhum arquivo encontrado para download.");

      const zip = new JSZip();
      for (const item of urls) {
        const resp = await fetch(item.url);
        const blob = await resp.blob();
        zip.file(item.path || item.name, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const now = new Date().toISOString().split("T")[0];
      saveAs(content, `Comprovantes-nao-lancados-${now}.zip`);
      toast.success("Download concluído!", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar arquivo ZIP.", { id: toastId });
    }
  };

  if (isBatchLoading || !batch) {
    return (
      <Card className="p-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "already_posted": return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
      case "not_found": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "possible_match": return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "error": return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "already_posted": return "Já lançado";
      case "not_found": return "Não localizado";
      case "possible_match": return "Revisar";
      case "error": return "Erro";
      case "duplicate_in_zip": return "Duplicado (ZIP)";
      default: return "Processando";
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4 bg-muted/30">
          <p className="text-xs text-muted-foreground">TOTAL ANALISADO</p>
          <p className="text-2xl font-bold">{batch.files_total}</p>
        </Card>
        <Card className="p-4 bg-blue-50">
          <p className="text-xs text-blue-600">JÁ LANÇADOS</p>
          <p className="text-2xl font-bold text-blue-700">{batch.already_found}</p>
        </Card>
        <Card className="p-4 bg-green-50">
          <p className="text-xs text-green-600">NÃO LOCALIZADOS</p>
          <p className="text-2xl font-bold text-green-700">{batch.not_found}</p>
        </Card>
        <Card className="p-4 bg-yellow-50">
          <p className="text-xs text-yellow-600">REVISAR</p>
          <p className="text-2xl font-bold text-yellow-700">{batch.needs_review}</p>
        </Card>
        <Card className="p-4 bg-red-50">
          <p className="text-xs text-red-600">ERROS</p>
          <p className="text-2xl font-bold text-red-700">{batch.errors}</p>
      </Card>

      <AnalysisCompareDialog 
        file={compareFile} 
        open={!!compareFile} 
        onOpenChange={(open) => !open && setCompareFile(null)} 
      />
    </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar arquivo, destinatário..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button onClick={handleDownload} className="gap-2 bg-green-600 hover:bg-green-700">
              <Download className="h-4 w-4" /> Baixar selecionados ({selectedIds.size})
            </Button>
          )}
          {batch.not_found > 0 && selectedIds.size === 0 && (
            <Button onClick={handleDownload} variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Baixar não lançados ({batch.not_found})
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="not_found">Não localizados</TabsTrigger>
          <TabsTrigger value="already_posted">Já lançados</TabsTrigger>
          <TabsTrigger value="possible_match">Possíveis correspondências</TabsTrigger>
          <TabsTrigger value="error">Erros</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox 
                  checked={selectedIds.size > 0 && selectedIds.size === filteredFiles.filter(f => f.analysis_status === "not_found").length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Destinatário</TableHead>
              <TableHead>Correspondência</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isFilesLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  Carregando arquivos...
                </TableCell>
              </TableRow>
            ) : filteredFiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  Nenhum arquivo encontrado.
                </TableCell>
              </TableRow>
            ) : filteredFiles.map(f => (
              <TableRow key={f.id}>
                <TableCell>
                  <Checkbox 
                    disabled={f.analysis_status !== "not_found"}
                    checked={selectedIds.has(f.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedIds);
                      if (checked) next.add(f.id);
                      else next.delete(f.id);
                      setSelectedIds(next);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(f.analysis_status)}
                    <span className="text-sm font-medium">{getStatusLabel(f.analysis_status)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate max-w-[200px]" title={f.file_name}>{f.file_name}</span>
                  </div>
                </TableCell>
                <TableCell>{f.payment_date ? dateBR(f.payment_date) : "—"}</TableCell>
                <TableCell>{f.amount ? currencyBRL(Number(f.amount)) : "—"}</TableCell>
                <TableCell className="max-w-[150px] truncate">{f.recipient_name || "—"}</TableCell>
                <TableCell>
                  {f.similarity_score ? (
                    <Badge variant={f.similarity_score >= 90 ? "default" : "secondary"}>
                      {f.similarity_score}%
                    </Badge>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {f.analysis_status === "already_posted" || f.analysis_status === "possible_match" ? (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => setCompareFile(f)}
                    >
                      <GitCompareArrows className="h-4 w-4" /> Comparar
                    </Button>
                  ) : (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => setCompareFile(f)}
                    >
                      <Eye className="h-4 w-4" /> Visualizar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
