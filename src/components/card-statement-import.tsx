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
  attachStatementFile,
} from "@/lib/card-statement.functions";
import { extractStatementText, sha256Hex } from "@/lib/card-statement-client";

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT = ["pdf", "png", "jpg", "jpeg", "webp", "xlsx", "xls", "csv"];

function sanitizeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const ext = (dot > 0 ? name.slice(dot + 1) : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${base || "fatura"}${ext ? `.${ext}` : ""}`;
}

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
  const attachFn = useServerFn(attachStatementFile);

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext)) {
      const msg = "Formato não suportado. Use PDF, imagem, planilha ou CSV.";
      setErr(msg);
      toast.error(msg);
      return;
    }
    if (file.size === 0) {
      const msg = "O arquivo está vazio.";
      setErr(msg);
      toast.error(msg);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      const msg = "Arquivo maior que 25 MB. Envie um arquivo menor.";
      setErr(msg);
      toast.error(msg);
      return;
    }
    setBusy(true);
    setErr(null);
    setPct(2);
    setStage("Verificando arquivo");
    let uploadedPath: string | null = null;
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");

      // Registra primeiro: se a fatura já existe, nada é enviado ao armazenamento.
      setStage("Registrando fatura");
      setPct(6);
      const created = await createFn({
        data: {
          cardId,
          sourceFileName: sanitizeFileName(file.name),
          sourceHash: hash,
          pagesTotal: null,
        },
      });
      if (created.duplicate) {
        toast.warning("Esta fatura já foi importada anteriormente.");
        onDone?.(created.statementId);
        return;
      }

      setStage("Enviando arquivo");
      setPct(8);
      const path = `card-statements/${u.user.id}/${hash}-${sanitizeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("receipts")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw new Error(`Falha ao enviar o arquivo: ${upErr.message}`);
      uploadedPath = path;
      await attachFn({ data: { statementId: created.statementId, sourceFilePath: path } });

      setStage("Lendo páginas");
      setPct(10);
      const { text, pages } = await extractStatementText(file, (s, p) => {
        setStage(s);
        setPct(Math.min(70, p));
      });

      if (!text || text.trim().length < 20) {
        throw new Error("Não foi possível extrair texto legível da fatura");
      }
      void pages;

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
      // Limpa arquivo órfão: o registro da fatura não chegou a ser concluído.
      if (uploadedPath) {
        const { error: rmErr } = await supabase.storage.from("receipts").remove([uploadedPath]);
        if (rmErr) console.warn("[fatura] arquivo órfão não removido:", uploadedPath, rmErr.message);
      }
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