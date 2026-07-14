import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Upload, Loader2, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  createStatement,
  analyzeStatement,
} from "@/lib/card-statement.functions";
import { extractStatementText, sha256Hex } from "@/lib/card-statement-client";

export function CardStatementImport({
  cardId,
  onDone,
}: {
  cardId: string;
  onDone?: (statementId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const createFn = useServerFn(createStatement);
  const analyzeFn = useServerFn(analyzeStatement);

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    setPct(2);
    setStage("Enviando arquivo");
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);

      // Upload no bucket receipts
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const path = `card-statements/${u.user.id}/${hash}-${file.name}`;
      await supabase.storage
        .from("receipts")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });

      setStage("Lendo páginas");
      setPct(10);
      const { text, pages } = await extractStatementText(file, (s, p) => {
        setStage(s);
        setPct(Math.min(70, p));
      });

      if (!text || text.trim().length < 20) {
        throw new Error("Não foi possível extrair texto legível da fatura");
      }

      setStage("Registrando fatura");
      const created = await createFn({
        data: {
          cardId,
          sourceFileName: file.name,
          sourceHash: hash,
          sourceFilePath: path,
          pagesTotal: pages,
        },
      });
      if (created.duplicate) {
        toast.warning("Esta fatura já foi importada anteriormente.");
        onDone?.(created.statementId);
        return;
      }

      setStage("Analisando lançamentos com IA (isso pode demorar)");
      setPct(80);
      const result = await analyzeFn({
        data: { statementId: created.statementId, text },
      });

      setPct(100);
      setStage("Concluído");
      toast.success(
        `${result.transactions} lançamentos identificados${result.duplicates ? ` · ${result.duplicates} duplicados` : ""}`,
      );
      onDone?.(created.statementId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4 text-primary" />
        Importar fatura
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Envie o PDF, imagem ou planilha da fatura. A IA fará leitura completa e
        rigorosa de todas as páginas.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="premium"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar fatura
        </Button>
        {busy && (
          <div className="flex-1 min-w-[240px]">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span className="truncate">{stage}</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} />
          </div>
        )}
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