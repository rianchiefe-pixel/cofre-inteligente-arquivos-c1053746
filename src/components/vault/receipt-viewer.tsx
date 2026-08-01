import { useEffect, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Button } from "@/components/ui/button";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export type PreviewState = {
  loading: boolean;
  url: string | null;
  downloadUrl: string | null;
  error: string | null;
  isObjectUrl?: boolean;
};

export const EMPTY_PREVIEW: PreviewState = {
  loading: false,
  url: null,
  downloadUrl: null,
  error: null,
  isObjectUrl: false,
};

export function inferMime(name?: string | null, mime?: string | null) {
  if (mime) return mime;
  const lower = (name ?? "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function clampZoom(v: number) {
  return Math.min(4, Math.max(0.4, v));
}

function ZoomPanFrame({
  zoom,
  setZoom,
  children,
}: {
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      if (w && h) setNatural((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const id = window.setInterval(measure, 500);
    return () => {
      ro.disconnect();
      window.clearInterval(id);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    el.scrollLeft = d.sl - (e.clientX - d.x);
    el.scrollTop = d.st - (e.clientY - d.y);
  };
  const endDrag = () => {
    dragRef.current = null;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };

  return (
    <div
      ref={scrollRef}
      className="h-full w-full select-none overflow-auto rounded-lg bg-background"
      style={{ cursor: "grab" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <div
        style={{
          width: natural.w ? natural.w * zoom : undefined,
          height: natural.h ? natural.h * zoom : undefined,
        }}
      >
        <div
          ref={innerRef}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            display: "inline-block",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function PdfCanvasPreview({ url, fileName }: { url: string; fileName?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [failedBeforeCanvas, setFailedBeforeCanvas] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let task: any = null;
    let hasCanvas = false;

    (async () => {
      try {
        setState("loading");
        setErrorText(null);
        setCanvasReady(false);
        setFailedBeforeCanvas(false);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        task = pdfjs.getDocument({ url });
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        if (cancelled || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(Math.max(900 / baseViewport.width, 1.5), 3);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const displayWidth = Math.min(620, Math.floor(viewport.width));
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = "auto";
        hasCanvas = true;
        setCanvasReady(true);
        await page.render({ canvas, viewport }).promise;
        if (!cancelled) setState("ready");
      } catch (error) {
        if (!cancelled) {
          if (
            hasCanvas ||
            (canvasRef.current && canvasRef.current.width > 0 && canvasRef.current.height > 0)
          ) {
            setCanvasReady(true);
            setState("ready");
          } else {
            setErrorText(error instanceof Error ? error.message : String(error));
            setFailedBeforeCanvas(true);
            setState("error");
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.destroy?.().catch?.(() => undefined);
    };
  }, [url]);

  return (
    <div className="relative p-3">
      {state === "loading" && !canvasReady && (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando PDF…
        </div>
      )}
      {failedBeforeCanvas && (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8" /> Não foi possível renderizar{" "}
          {fileName ?? "este PDF"} dentro da conferência. Use abrir em nova aba ou baixar.
          {errorText ? <span className="mt-2 block text-xs opacity-70">{errorText}</span> : null}
        </div>
      )}
      <canvas
        ref={canvasRef}
        aria-label={fileName ? `Prévia de ${fileName}` : "Prévia do PDF"}
        className="rounded shadow-sm"
        draggable={false}
      />
    </div>
  );
}

export function ReceiptViewerPane({
  preview,
  fileName,
  fileMime,
  onAnalyze,
  analyzeLabel,
  busy,
  onPreviewError,
}: {
  preview: PreviewState;
  fileName?: string | null;
  fileMime?: string | null;
  onAnalyze: () => void;
  analyzeLabel: string;
  busy?: boolean;
  onPreviewError: (message: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const mime = inferMime(fileName, fileMime);

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-border bg-muted/30 lg:border-r">
      {/* Barra de ferramentas fixa */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card/70 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom((z) => clampZoom(z - 0.2))}
          title="Diminuir zoom"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="min-w-[3.25rem] text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom((z) => clampZoom(z + 0.2))}
          title="Aumentar zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom(() => 1)}
          title="Redefinir zoom"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        {preview.url && (
          <Button asChild variant="ghost" size="sm" className="h-8">
            <a href={preview.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />{" "}
              <span className="hidden sm:inline">Nova aba</span>
            </a>
          </Button>
        )}
        {preview.downloadUrl && (
          <Button asChild variant="ghost" size="sm" className="h-8">
            <a href={preview.downloadUrl} download={fileName ?? true}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Baixar</span>
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8"
          onClick={onAnalyze}
          disabled={busy}
        >
          <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">{analyzeLabel}</span>
        </Button>
      </div>

      {/* Área do documento — ocupa o espaço restante */}
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-background">
          {preview.loading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando prévia…
              </span>
            </div>
          ) : preview.url ? (
            mime.startsWith("image/") ? (
              <ZoomPanFrame zoom={zoom} setZoom={setZoom}>
                <img
                  src={preview.url}
                  alt={fileName ?? "Comprovante"}
                  className="block max-w-none rounded"
                  draggable={false}
                  onError={() =>
                    onPreviewError("A imagem não pôde ser exibida dentro da conferência.")
                  }
                />
              </ZoomPanFrame>
            ) : mime === "application/pdf" ? (
              <ZoomPanFrame zoom={zoom} setZoom={setZoom}>
                <PdfCanvasPreview url={preview.url} fileName={fileName} />
              </ZoomPanFrame>
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                <div>
                  <FileText className="mx-auto mb-2 h-8 w-8" /> Este tipo de arquivo deve ser aberto
                  ou baixado para conferência.
                </div>
              </div>
            )
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
              <div>
                <FileText className="mx-auto mb-2 h-8 w-8" />{" "}
                {preview.error ?? "Não foi possível carregar a prévia do comprovante."}
              </div>
            </div>
          )}
        </div>
        {preview.error && preview.url && (
          <p className="mt-2 text-xs text-destructive">{preview.error}</p>
        )}
      </div>
    </div>
  );
}
