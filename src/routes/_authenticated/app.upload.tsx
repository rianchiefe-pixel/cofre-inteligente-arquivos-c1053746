import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeReceipt } from "@/lib/receipts.functions";

export const Route = createFileRoute("/_authenticated/app/upload")({
  head: () => ({ meta: [{ title: "Enviar comprovantes — Meu Cofre" }] }),
  component: UploadPage,
});

type Item = {
  file: File;
  status: "waiting" | "uploading" | "enviado" | "lendo" | "identificando" | "cruzando" | "pronto" | "duplicate" | "error";
  message?: string;
  receiptId?: string;
};

async function sha256(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function UploadPage() {
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeReceipt);
  const [profileId, setProfileId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("financial_profiles").select("id, name").order("name")).data ?? [] });

  const process = useCallback(async (files: File[]) => {
    if (!profileId) return toast.error("Selecione um perfil antes de enviar");
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user!.id;

    const initial: Item[] = files.map((f) => ({ file: f, status: "waiting" }));
    setItems((prev) => [...prev, ...initial]);
    const startIdx = items.length;

    for (let i = 0; i < files.length; i++) {
      const idx = startIdx + i;
      const file = files[i];
      try {
        setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, status: "uploading" } : it)));
        const buf = await file.arrayBuffer();
        const hash = await sha256(buf);
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${userId}/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;

        const contentType =
          file.type ||
          (ext === "pdf"
            ? "application/pdf"
            : ext === "png"
              ? "image/png"
              : ext === "jpg" || ext === "jpeg"
                ? "image/jpeg"
                : "application/octet-stream");
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, { contentType });
        if (upErr) throw new Error(upErr.message);

        const { data: inserted, error: insErr } = await supabase.from("receipts").insert({
          user_id: userId,
          profile_id: profileId,
          file_path: path,
          file_name: file.name,
          file_mime: file.type,
          file_size: file.size,
          file_hash: hash,
          ocr_status: "queued",
          status: "pending",
        }).select("id").single();
        if (insErr || !inserted) throw new Error(insErr?.message ?? "insert falhou");

        setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, status: "enviado", receiptId: inserted.id } : it)));
        
        // Simulação de passos de processamento para feedback visual
        setTimeout(() => setItems((prev) => prev.map((it, j) => (j === idx && it.status === "enviado" ? { ...it, status: "lendo" } : it))), 1000);
        setTimeout(() => setItems((prev) => prev.map((it, j) => (j === idx && it.status === "lendo" ? { ...it, status: "identificando" } : it))), 3000);
        setTimeout(() => setItems((prev) => prev.map((it, j) => (j === idx && it.status === "identificando" ? { ...it, status: "cruzando" } : it))), 5000);

        const res = await analyze({ data: { receiptId: inserted.id } });
        if (!res.ok) throw new Error(res.error ?? "Não foi possível analisar o comprovante");
        setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, status: res.duplicate_of ? "duplicate" : "pronto" } : it)));
      } catch (e: any) {
        setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, status: "error", message: e.message } : it)));
      }
    }

    qc.invalidateQueries({ queryKey: ["receipts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }, [profileId, analyze, qc, items.length]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    process(files);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Enviar comprovantes</h1>
        <p className="text-sm text-muted-foreground">PDF, JPG ou PNG. Envie um por vez ou vários de uma vez. A IA lê e classifica automaticamente.</p>
      </div>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label>Perfil destino</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
              <SelectContent>{(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button asChild variant="outline"><Link to="/app/vault">Ver cofre →</Link></Button>
        </div>
      </Card>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
        }`}
      >
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground">
          <UploadCloud className="h-7 w-7" />
        </div>
        <p className="mt-4 text-base font-semibold text-foreground">Arraste e solte comprovantes aqui</p>
        <p className="mt-1 text-sm text-muted-foreground">ou clique para selecionar arquivos (PDF, JPG, PNG)</p>
        <input
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => e.target.files && process(Array.from(e.target.files))}
        />
      </label>

      {items.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Envios</h2>
          <div className="divide-y divide-border">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{it.file.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {it.status === "waiting" && "Aguardando…"}
                    {it.status === "uploading" && "Enviando…"}
                    {it.status === "analyzing" && "Analisando com IA…"}
                    {it.status === "done" && "Pronto — pendente de conferência"}
                    {it.status === "duplicate" && "⚠️ Possível comprovante repetido"}
                    {it.status === "error" && `Erro: ${it.message ?? ""}`}
                  </p>
                </div>
                <div>
                  {(it.status === "uploading" || it.status === "analyzing") && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {it.status === "done" && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {it.status === "duplicate" && <AlertTriangle className="h-4 w-4 text-accent" />}
                  {it.status === "error" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  {it.receiptId && (it.status === "done" || it.status === "duplicate") && (
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/app/vault" search={{ receipt: it.receiptId }}>Conferir</Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button asChild variant="premium">
              <Link
                to="/app/vault"
                search={(() => {
                  const last = [...items].reverse().find((x) => x.receiptId && (x.status === "done" || x.status === "duplicate"));
                  return last?.receiptId ? { receipt: last.receiptId } : {};
                })()}
              >
                Ir para conferência
              </Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}