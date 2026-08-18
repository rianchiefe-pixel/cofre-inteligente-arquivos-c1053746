import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileArchive, Loader2 } from "lucide-react";
import { processAnalysisZip, type AnalysisProgress } from "@/lib/receipt-analysis";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface AnalysisUploadProps {
  onComplete: (batchId: string) => void;
}

export function AnalysisUpload({ onComplete }: AnalysisUploadProps) {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !user) return;
    
    const file = acceptedFiles[0];
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Por favor, envie um arquivo ZIP.");
      return;
    }

    setIsUploading(true);
    try {
      const batchId = await processAnalysisZip(
        file,
        user.id,
        (p) => setProgress({ ...p })
      );
      onComplete(batchId);
      toast.success("Processamento concluído!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao processar o arquivo ZIP.");
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  }, [user, onComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
    multiple: false,
    disabled: isUploading
  });

  if (isUploading && progress) {
    return (
      <Card className="p-12 flex flex-col items-center justify-center text-center space-y-6">
        <div className="relative">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <FileArchive className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="space-y-2 w-full max-w-md">
          <p className="text-lg font-medium">Analisando comprovantes...</p>
          <p className="text-sm text-muted-foreground truncate">
            {progress.currentFile ? `Lendo: ${progress.currentFile}` : "Iniciando..."}
          </p>
          <Progress value={progress.percent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.filesProcessed} de {progress.filesFound} arquivos</span>
            <span>{progress.percent}%</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-2xl pt-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">Já lançados</p>
            <p className="text-xl font-bold text-blue-600">{progress.alreadyFound}</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">Não localizados</p>
            <p className="text-xl font-bold text-green-600">{progress.notFound}</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">Revisar</p>
            <p className="text-xl font-bold text-yellow-600">{progress.needsReview}</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">Erros</p>
            <p className="text-xl font-bold text-red-600">{progress.errors}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      <Card className={`
        p-16 border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center text-center space-y-4
        ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"}
      `}>
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Arraste seu arquivo ZIP aqui</h3>
          <p className="text-muted-foreground max-w-sm">
            Descubra quais comprovantes já estão lançados no seu Cofre de forma automática.
          </p>
        </div>
        <Button variant="outline" size="lg">Selecionar ZIP</Button>
        <p className="text-xs text-muted-foreground">Apenas arquivos .zip são aceitos</p>
      </Card>
    </div>
  );
}
