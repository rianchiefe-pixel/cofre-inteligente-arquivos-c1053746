import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileArchive, Loader2, Play, RotateCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  extractZipToStorage,
  processZipFiles,
  getZipSnapshot,
  type ZipProgress,
} from "@/lib/zip-import";

type Props = { batchId: string };

export function ImportZipPanel({ batchId }: Props) {
  const [progress, setProgress] = useState<ZipProgress>({
    filesFound: 0,
    filesProcessed: 0,
    pdfsRead: 0,
    imagesRead: 0,
    pagesProcessed: 0,
    errors: 0,
    percent: 0,
  });
  const [busy, setBusy] = useState<"idle" | "extract" | "process">("idle");
  const [runOcr, setRunOcr] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const snap = await getZipSnapshot(batchId);
    setProgress(snap);
  }, [batchId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const onFile = async (file: File) => {
    setErr(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    setBusy("extract");
    try {
      await extractZipToStorage({
        batchId,
        userId: auth.user.id,
        file,
        onProgress: (p) => setProgress(p),
      });
      toast.success("ZIP extraído. Iniciando leitura dos arquivos…");
      await runProcess(auth.user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy("idle");
      refresh();
    }
  };

  const runProcess = async (userId?: string) => {
    setErr(null);
    const uid =
      userId ?? (await supabase.auth.getUser()).data.user?.id ?? undefined;
    if (!uid) return;
    abortRef.current = new AbortController();
    setBusy("process");
    try {
      await processZipFiles({
        batchId,
        userId: uid,
        runOcr,
        signal: abortRef.current.signal,
        onProgress: ({ processed, total, pages, errors, current }) => {
          setProgress((p) => ({
            ...p,
            filesProcessed: processed,
            filesFound: Math.max(p.filesFound, total),
            pagesProcessed: pages,
            errors,
            currentFile: current,
            percent: total ? Math.round((processed / total) * 100) : 0,
          }));
        },
      });
      toast.success("Processamento concluído");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy("idle");
      refresh();
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <FileArchive className="h-4 w-4 text-primary" />
        Comprovantes (ZIP com PDFs e imagens)
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== "idle"}
        >
          {busy === "extract" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileArchive className="h-4 w-4" />
          )}
          Enviar ZIP
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runProcess()}
          disabled={busy !== "idle"}
        >
          {busy === "process" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Processar pendentes
        </Button>
        <Button size="sm" variant="ghost" onClick={refresh}>
          <RotateCw className="h-4 w-4" />
          Atualizar
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="ocr" checked={runOcr} onCheckedChange={setRunOcr} />
          <Label htmlFor="ocr" className="text-xs">
            OCR (português + inglês)
          </Label>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Metric label="Encontrados" value={progress.filesFound} />
        <Metric label="Processados" value={progress.filesProcessed} />
        <Metric label="PDFs" value={progress.pdfsRead} />
        <Metric label="Imagens" value={progress.imagesRead} />
        <Metric label="Páginas" value={progress.pagesProcessed} />
        <Metric label="Erros" value={progress.errors} tone={progress.errors ? "danger" : undefined} />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span className="truncate">
            {progress.currentFile ?? (busy === "idle" ? "Aguardando" : "Trabalhando…")}
          </span>
          <span>{progress.percent}%</span>
        </div>
        <Progress value={progress.percent} />
      </div>

      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold ${
          tone === "danger" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}