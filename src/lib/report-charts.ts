import type jsPDF from "jspdf";

export type RGB = [number, number, number];

export const CHART_BLUE: RGB = [31, 119, 180];

function niceStep(max: number): number {
  const raw = max / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/** Compacta valores do eixo: 0 -> "R$ 0,00"; 100000 -> "R$ 100 mil". */
export function axisMoney(v: number): string {
  if (v === 0) return "R$ 0,00";
  if (Math.abs(v) >= 1000) return `R$ ${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
  return `R$ ${v.toLocaleString("pt-BR")}`;
}

export interface BarItem {
  label: string;
  value: number;
  valueLabel: string;
  color?: RGB;
}

export interface HBarOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  items: BarItem[];
  barColor?: RGB;
  labelWidth?: number;
  valueGap?: number;
  axisTitle?: string;
  axisFormatter?: (v: number) => string;
  fontSize?: number;
  valueFontStyle?: "normal" | "bold";
  frame?: boolean;
  outlineBars?: boolean;
}

/** Gráfico de barras horizontais equivalente ao padrão matplotlib usado nos relatórios. */
export function drawHBarChart(doc: jsPDF, o: HBarOptions) {
  const items = o.items;
  const fontSize = o.fontSize ?? 6;
  const labelW = o.labelWidth ?? Math.min(120, o.w * 0.22);
  const rightPad = 12;
  const titleH = o.title ? 18 : 0;
  const axisH = o.axisTitle ? 26 : 16;
  const plotX = o.x + labelW;
  const plotY = o.y + titleH;
  const plotW = o.w - labelW - rightPad;
  const plotH = o.h - titleH - axisH;

  if (o.title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(20, 20, 20);
    doc.text(o.title, o.x + o.w / 2, o.y + 10, { align: "center" });
  }

  const maxValue = Math.max(1, ...items.map((i) => i.value));
  const step = niceStep(maxValue);
  const axisMax = Math.ceil(maxValue / step) * step + (Math.ceil(maxValue / step) * step === maxValue ? step : 0);

  // Moldura + gridlines
  if (o.frame !== false) {
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.6);
    doc.rect(plotX, plotY, plotW, plotH);
  }
  doc.setLineWidth(0.3);
  doc.setDrawColor(215, 215, 215);
  const fmt = o.axisFormatter ?? ((v: number) => v.toLocaleString("pt-BR"));
  for (let v = 0; v <= axisMax + 1e-6; v += step) {
    const gx = plotX + (v / axisMax) * plotW;
    if (v > 0) doc.line(gx, plotY, gx, plotY + plotH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(60, 60, 60);
    doc.text(fmt(v), gx, plotY + plotH + 10, { align: "center" });
  }

  const slot = plotH / Math.max(1, items.length);
  const barH = Math.min(slot * 0.62, 16);
  items.forEach((item, i) => {
    const cy = plotY + slot * i + slot / 2;
    const bw = Math.max(0.5, (item.value / axisMax) * plotW);
    const color = item.color ?? o.barColor ?? CHART_BLUE;
    doc.setFillColor(color[0], color[1], color[2]);
    if (o.outlineBars) {
      doc.setDrawColor(70, 70, 70);
      doc.setLineWidth(0.4);
      doc.rect(plotX, cy - barH / 2, bw, barH, "FD");
    } else {
      doc.rect(plotX, cy - barH / 2, bw, barH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 30, 30);
    doc.text(item.label, plotX - 6, cy + fontSize * 0.35, { align: "right" });
    doc.setFont("helvetica", o.valueFontStyle ?? "normal");
    doc.text(item.valueLabel, plotX + bw + 4, cy + fontSize * 0.35);
  });

  if (o.axisTitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(60, 60, 60);
    doc.text(o.axisTitle, plotX + plotW / 2, plotY + plotH + 22, { align: "center" });
  }
  doc.setTextColor(0, 0, 0);
  return plotY + plotH + axisH;
}

export interface LineSeries {
  name: string;
  color: RGB;
  values: number[];
}

export interface LineOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  categories: string[];
  series: LineSeries[];
  axisTitle?: string;
  legend?: boolean;
}

/** Gráfico de linhas com marcadores + legenda (padrão do consolidado geral). */
export function drawLineChart(doc: jsPDF, o: LineOptions) {
  const titleH = o.title ? 20 : 0;
  const legendH = o.legend === false ? 0 : 30;
  const leftPad = 62;
  const plotX = o.x + leftPad;
  const plotY = o.y + titleH;
  const plotW = o.w - leftPad - 10;
  const plotH = o.h - titleH - legendH - 22;

  if (o.title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(o.title, o.x + o.w / 2, o.y + 12, { align: "center" });
  }

  const maxValue = Math.max(1, ...o.series.flatMap((s) => s.values));
  const step = niceStep(maxValue);
  const axisMax = Math.ceil(maxValue / step) * step;

  doc.setLineWidth(0.3);
  for (let v = 0; v <= axisMax + 1e-6; v += step) {
    const gy = plotY + plotH - (v / axisMax) * plotH;
    doc.setDrawColor(225, 225, 225);
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(60, 60, 60);
    doc.text(axisMoney(v), plotX - 6, gy + 2, { align: "right" });
  }
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.6);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

  const n = Math.max(1, o.categories.length);
  const xAt = (i: number) => plotX + (n === 1 ? plotW / 2 : (plotW / (n - 1)) * i);
  o.categories.forEach((c, i) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(40, 40, 40);
    doc.text(c, xAt(i), plotY + plotH + 12, { align: "center" });
  });

  o.series.forEach((s) => {
    doc.setDrawColor(s.color[0], s.color[1], s.color[2]);
    doc.setFillColor(s.color[0], s.color[1], s.color[2]);
    doc.setLineWidth(1.2);
    s.values.forEach((v, i) => {
      const px = xAt(i);
      const py = plotY + plotH - (v / axisMax) * plotH;
      if (i > 0) {
        const prevX = xAt(i - 1);
        const prevY = plotY + plotH - (s.values[i - 1] / axisMax) * plotH;
        doc.line(prevX, prevY, px, py);
      }
      doc.circle(px, py, 2, "F");
    });
  });

  if (o.axisTitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(60, 60, 60);
    const cx = o.x + 10;
    doc.text(o.axisTitle, cx, plotY + plotH / 2, { align: "center", angle: 90 });
  }

  if (o.legend !== false) {
    const perRow = Math.ceil(o.series.length / 2);
    const itemW = 118;
    const rows = Math.ceil(o.series.length / perRow);
    const startY = plotY + plotH + 24;
    o.series.forEach((s, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowCount = row === rows - 1 ? o.series.length - perRow * row : perRow;
      const rowW = rowCount * itemW;
      const sx = o.x + (o.w - rowW) / 2 + col * itemW;
      const sy = startY + row * 12;
      doc.setDrawColor(s.color[0], s.color[1], s.color[2]);
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.setLineWidth(1.2);
      doc.line(sx, sy, sx + 16, sy);
      doc.circle(sx + 8, sy, 1.8, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(30, 30, 30);
      doc.text(s.name, sx + 20, sy + 2.2);
    });
  }
  doc.setTextColor(0, 0, 0);
}
