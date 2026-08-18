import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AnalysisReceiptViewerProps {
  file: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnalysisReceiptViewer({ file, open, onOpenChange }: AnalysisReceiptViewerProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open && file?.storage_path) {
      supabase.storage
        .from("receipts")
        .createSignedUrl(file.storage_path, 3600)
        .then(({ data }) => setFileUrl(data?.signedUrl || null));
    }
  }, [open, file]);

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Visualizar: {file.file_name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 bg-muted/20 p-4">
          {fileUrl ? (
            <iframe src={fileUrl} className="w-full h-full border-none rounded shadow-sm bg-white" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground italic">
              Carregando comprovante...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
