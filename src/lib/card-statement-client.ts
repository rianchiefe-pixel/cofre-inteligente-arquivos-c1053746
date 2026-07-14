// Client-side extraction of statement text — reused by the upload flow.
// PDFs → pdfjs; images → tesseract; xlsx → SheetJS.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ExtractProgress = (stage: string, pct: number) => void;

export async function extractStatementText(
  file: File,
  onProgress?: ExtractProgress,
): Promise<{ text: string; pages: number }> {
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf(".") + 1);
  onProgress?.("Lendo arquivo", 5);

  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const total = doc.numPages;
    const parts: string[] = [];
    for (let p = 1; p <= total; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const t = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
      parts.push(`--- página ${p} ---\n${t}`);
      onProgress?.(`Lendo página ${p} de ${total}`, 5 + Math.round((p / total) * 55));
    }
    let text = parts.join("\n\n");

    // OCR fallback quando o PDF é uma imagem digitalizada.
    if (text.replace(/[^A-Za-z0-9]/g, "").length < 40) {
      onProgress?.("Executando OCR (fatura digitalizada)", 30);
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker("por+eng");
      try {
        const ocrParts: string[] = [];
        for (let p = 1; p <= total; p += 1) {
          const page = await doc.getPage(p);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          const { data } = await worker.recognize(canvas);
          ocrParts.push(`--- página ${p} (OCR) ---\n${data.text}`);
          onProgress?.(`OCR página ${p}/${total}`, 30 + Math.round((p / total) * 40));
        }
        text = ocrParts.join("\n\n");
      } finally {
        await worker.terminate();
      }
    }
    return { text, pages: total };
  }

  if (["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff"].includes(ext)) {
    onProgress?.("Executando OCR", 20);
    const Tesseract = await import("tesseract.js");
    const worker = await Tesseract.createWorker("por+eng");
    try {
      const url = URL.createObjectURL(file);
      const { data } = await worker.recognize(url);
      URL.revokeObjectURL(url);
      return { text: data.text, pages: 1 };
    } finally {
      await worker.terminate();
    }
  }

  if (["xlsx", "xls", "csv"].includes(ext)) {
    onProgress?.("Lendo planilha", 20);
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      parts.push(`--- ${sheetName} ---\n${csv}`);
    }
    return { text: parts.join("\n\n"), pages: wb.SheetNames.length };
  }

  throw new Error(`Formato não suportado: .${ext}`);
}