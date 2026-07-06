import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { runExport, type ExportFormat, type ReportPayload } from "@/lib/exports";

interface Props {
  build: () => ReportPayload | Promise<ReportPayload>;
  disabled?: boolean;
  label?: string;
  variant?: "premium" | "outline" | "default";
}

export function ExportMenu({ build, disabled, label = "Exportar", variant = "premium" }: Props) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);

  const run = async (fmt: ExportFormat) => {
    try {
      setLoading(fmt);
      const payload = await build();
      if (!payload.rows.length && fmt !== "pdf") {
        toast.error("Nada para exportar com os filtros atuais.");
        return;
      }
      await runExport(fmt, payload);
      toast.success(`Relatório ${fmt.toUpperCase()} gerado com sucesso.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar relatório.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} disabled={disabled || loading !== null}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run("pdf")} disabled={loading !== null}>
          <FileText className="h-4 w-4" /> Exportar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("xlsx")} disabled={loading !== null}>
          <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("csv")} disabled={loading !== null}>
          <Download className="h-4 w-4" /> Exportar CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}