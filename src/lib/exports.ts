import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

const NAVY: [number, number, number] = [15, 32, 68];
const GOLD: [number, number, number] = [191, 149, 63];
const GRAY: [number, number, number] = [110, 118, 132];

function hexToRgb(hex?: string | null): [number, number, number] | null {
  if (!hex) return null;
  const m = hex.trim().replace("#", "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]) {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

// Enforce a minimum contrast against the header band by falling back to navy.
function ensureReadable(color: [number, number, number] | null): [number, number, number] {
  if (!color) return NAVY;
  return luminance(color) > 0.75 ? NAVY : color;
}

export interface ReportBrand {
  displayName?: string | null;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  footerText?: string | null;
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

export interface ExportColumn<T = any> {
  header: string;
  key: string;
  get?: (row: T) => any;
  width?: number;
  align?: "left" | "right" | "center";
}

export interface SummaryItem {
  label: string;
  value: string;
}

export interface ReportPayload<T = any> {
  title: string;
  subtitle?: string;
  period?: { from?: string; to?: string };
  filters?: Record<string, string | undefined>;
  summary?: SummaryItem[];
  breakdowns?: Array<{ title: string; rows: Array<{ name: string; value: string }> }>;
  columns: ExportColumn<T>[];
  rows: T[];
  filename: string;
  reportKind: string;
  brand?: ReportBrand | null;
}

function fmtDate(d: Date) {
  return d.toLocaleString("pt-BR");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Proteção contra CSV/Excel formula injection.
 * Campos textuais iniciados por `=`, `+`, `-`, `@`, TAB ou CR são
 * prefixados com apóstrofo para que a planilha trate como texto.
 */
export function sanitizeSpreadsheetValue(raw: unknown): string {
  if (raw == null) return "";
  const v = String(raw);
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export interface ExportAuditResult {
  audited: boolean;
  auditError: string | null;
}

export async function logExport(params: {
  reportKind: string;
  format: ExportFormat;
  filters?: Record<string, any>;
  rowCount?: number;
}): Promise<ExportAuditResult> {
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
      return { audited: false, auditError: authError?.message ?? "Sessão não identificada" };
    }
    const { data, error } = await supabase.from("audit_logs").insert({
      user_id: auth.user.id,
      action: "exported",
      entity: "report",
      entity_id: null,
      new_value: {
        report: params.reportKind,
        format: params.format,
        filters: params.filters ?? {},
        row_count: params.rowCount ?? 0,
      } as any,
      note: `Exportou ${params.reportKind} em ${params.format.toUpperCase()}`,
    }).select("id");
    if (error) return { audited: false, auditError: error.message };
    if (!data || data.length !== 1) return { audited: false, auditError: "Registro de auditoria não confirmado" };
    return { audited: true, auditError: null };
  } catch (e: any) {
    return { audited: false, auditError: e?.message ?? "Falha ao registrar auditoria" };
  }
}

export function exportCSV<T>(payload: ReportPayload<T>) {
  const headers = payload.columns.map((c) => c.header);
  const lines = payload.rows.map((r) =>
    payload.columns
      .map((c) => {
        const raw = c.get ? c.get(r) : (r as any)[c.key];
        const v = sanitizeSpreadsheetValue(raw);
        return `"${v.replace(/"/g, '""')}"`;
      })
      .join(";"),
  );
  const csv = [headers.map((h) => `"${sanitizeSpreadsheetValue(h).replace(/"/g, '""')}"`).join(";"), ...lines].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  download(blob, `${payload.filename}.csv`);
  return logExport({ reportKind: payload.reportKind, format: "csv", filters: payload.filters, rowCount: payload.rows.length });
}

export function exportXLSX<T>(payload: ReportPayload<T>) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryAoA: any[][] = [];
  const b = payload.brand ?? null;
  const brandName = b?.displayName || b?.legalName;
  if (brandName) summaryAoA.push([brandName]);
  summaryAoA.push([payload.title]);
  if (payload.subtitle) summaryAoA.push([payload.subtitle]);
  if (b?.taxId) summaryAoA.push([`CPF/CNPJ: ${b.taxId}`]);
  if (b?.address) summaryAoA.push([b.address]);
  if (b?.phone || b?.email) summaryAoA.push([[b?.phone, b?.email].filter(Boolean).join(" · ")]);
  if (payload.period?.from || payload.period?.to) {
    summaryAoA.push([`Período: ${payload.period?.from ?? "—"} a ${payload.period?.to ?? "—"}`]);
  }
  summaryAoA.push([`Gerado em: ${fmtDate(new Date())}`]);
  summaryAoA.push([]);
  if (payload.summary?.length) {
    summaryAoA.push(["Indicador", "Valor"]);
    payload.summary.forEach((s) => summaryAoA.push([s.label, s.value]));
    summaryAoA.push([]);
  }
  (payload.breakdowns ?? []).forEach((b) => {
    summaryAoA.push([b.title]);
    summaryAoA.push(["Descrição", "Valor"]);
    b.rows.forEach((r) => summaryAoA.push([r.name, r.value]));
    summaryAoA.push([]);
  });
  if (b?.footerText) { summaryAoA.push([]); summaryAoA.push([b.footerText]); }
  const wsResumo = XLSX.utils.aoa_to_sheet(summaryAoA);
  wsResumo["!cols"] = [{ wch: 40 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  // Data sheet
  const dataAoA: any[][] = [payload.columns.map((c) => c.header)];
  payload.rows.forEach((r) => {
    dataAoA.push(
      payload.columns.map((c) => {
        const raw = c.get ? c.get(r) : (r as any)[c.key];
        // Números permanecem números; apenas texto recebe proteção anti-fórmula.
        return typeof raw === "number" ? raw : sanitizeSpreadsheetValue(raw);
      }),
    );
  });
  const wsData = XLSX.utils.aoa_to_sheet(dataAoA);
  wsData["!cols"] = payload.columns.map((c) => ({ wch: c.width ?? Math.max(12, c.header.length + 4) }));
  wsData["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
  if (dataAoA.length > 1) {
    wsData["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: payload.columns.length - 1, r: dataAoA.length - 1 } }) };
  }
  XLSX.utils.book_append_sheet(wb, wsData, "Lançamentos");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(new Blob([out], { type: "application/octet-stream" }), `${payload.filename}.xlsx`);
  return logExport({ reportKind: payload.reportKind, format: "xlsx", filters: payload.filters, rowCount: payload.rows.length });
}

export function exportPDF<T>(payload: ReportPayload<T>) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const brand = payload.brand ?? null;
  const headerColor = ensureReadable(hexToRgb(brand?.primaryColor)) ?? NAVY;
  const accentColor = hexToRgb(brand?.accentColor) ?? GOLD;
  const tableHeadColor = ensureReadable(hexToRgb(brand?.secondaryColor)) ?? headerColor;

  // Header band
  doc.setFillColor(...headerColor);
  doc.rect(0, 0, pageWidth, 90, "F");
  doc.setFillColor(...accentColor);
  doc.rect(0, 90, pageWidth, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const brandLabel = (brand?.displayName || brand?.legalName || "MEU COFRE").toUpperCase();
  let textLeft = margin;
  if (brand?.logoUrl && brand.logoUrl.startsWith("data:image/")) {
    try {
      const fmt = brand.logoUrl.substring(11, brand.logoUrl.indexOf(";")).toUpperCase();
      doc.addImage(brand.logoUrl, fmt === "SVG+XML" ? "PNG" : fmt, margin, 18, 56, 56);
      textLeft = margin + 68;
    } catch { /* invalid image */ }
  }
  doc.text(brandLabel, textLeft, 34);
  doc.setFontSize(18);
  doc.text(payload.title, textLeft, 60);
  if (payload.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(payload.subtitle, textLeft, 78);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const generatedAt = fmtDate(new Date());
  doc.text(`Gerado em ${generatedAt}`, pageWidth - margin, 34, { align: "right" });
  if (payload.period?.from || payload.period?.to) {
    doc.text(`Período: ${payload.period?.from ?? "—"} a ${payload.period?.to ?? "—"}`, pageWidth - margin, 50, { align: "right" });
  }
  if (brand?.taxId) doc.text(`CPF/CNPJ: ${brand.taxId}`, pageWidth - margin, 66, { align: "right" });

  let y = 120;
  // Institutional block
  if (brand?.address || brand?.phone || brand?.email) {
    doc.setTextColor(...GRAY);
    doc.setFontSize(8);
    const parts = [brand.address, brand.phone, brand.email].filter(Boolean).join(" · ");
    doc.text(parts, margin, y);
    y += 16;
  }
  doc.setTextColor(...headerColor);

  // Summary cards
  if (payload.summary?.length) {
    const cardsPerRow = 3;
    const gap = 12;
    const cardW = (pageWidth - margin * 2 - gap * (cardsPerRow - 1)) / cardsPerRow;
    const cardH = 56;
    payload.summary.forEach((s, i) => {
      const col = i % cardsPerRow;
      const row = Math.floor(i / cardsPerRow);
      const x = margin + col * (cardW + gap);
      const cy = y + row * (cardH + gap);
      doc.setDrawColor(230, 232, 238);
      doc.setFillColor(248, 249, 252);
      doc.roundedRect(x, cy, cardW, cardH, 6, 6, "FD");
      doc.setTextColor(...GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(s.label.toUpperCase(), x + 12, cy + 18);
      doc.setTextColor(...headerColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(s.value, x + 12, cy + 40);
    });
    const rows = Math.ceil(payload.summary.length / cardsPerRow);
    y += rows * (cardH + gap) + 8;
  }

  // Breakdowns
  (payload.breakdowns ?? []).forEach((b) => {
    autoTable(doc, {
      startY: y,
      head: [[b.title, "Valor"]],
      body: b.rows.map((r) => [r.name, r.value]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6, textColor: [30, 30, 30] },
      headStyles: { fillColor: tableHeadColor, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  });

  // Main table
  if (payload.columns.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [payload.columns.map((c) => c.header)],
      body: payload.rows.map((r) => payload.columns.map((c) => {
        const v = c.get ? c.get(r) : (r as any)[c.key];
        return v == null ? "" : String(v);
      })),
      theme: "striped",
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak", cellWidth: "wrap", minCellHeight: 10, textColor: [30, 30, 30] },
      headStyles: { fillColor: tableHeadColor, textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: payload.columns.reduce((acc, c, i) => {
        acc[i] = { cellWidth: (c.width ? (c.width * pageWidth) / 100 : "auto") };
        return acc;
      }, {} as any),
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        const p = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        const footer = brand?.footerText || "Relatório gerado automaticamente pelo Meu Cofre";
        doc.text(footer, margin, pageHeight - 20);
        doc.text(`${generatedAt} · Página ${p}`, pageWidth - margin, pageHeight - 20, { align: "right" });
      },
    });
  }

  doc.save(`${payload.filename}.pdf`);
  return logExport({ reportKind: payload.reportKind, format: "pdf", filters: payload.filters, rowCount: payload.rows.length });
}

export async function runExport<T>(fmt: ExportFormat, payload: ReportPayload<T>) {
  if (fmt === "csv") return exportCSV(payload);
  if (fmt === "xlsx") return exportXLSX(payload);
  return exportPDF(payload);
}