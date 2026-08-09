import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { axisMoney, drawHBarChart, drawLineChart, type RGB } from "@/lib/report-charts";
import { logExport } from "@/lib/exports";
import { currencyBRL, dateBR } from "@/lib/format";
import { centsToNumber, type CategoryRow, type LedgerEntry, type MonthBlock, type ReportDataset, UNCATEGORIZED } from "@/lib/report-data";
import { assertReportDataset } from "@/lib/report-validation";

const BLACK: RGB = [0, 0, 0];
const NAVY: RGB = [56, 75, 107];
const NAVY_TEXT: RGB = [31, 60, 95];
const RED: RGB = [192, 0, 0];
const BLUE: RGB = [46, 117, 182];
const TAN: RGB = [197, 148, 84];
const TAN_LIGHT: RGB = [214, 185, 145];

const money = (v: number) => currencyBRL(v);

function lastY(doc: jsPDF) {
  return (doc as any).lastAutoTable.finalY as number;
}

/** Redesenha o cabeçalho executivo com cores Navy/Tan */
function drawReportHeader(doc: jsPDF, title: string, subtitle: string, pw: number, margin: number) {
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, pw, 80, "F");
  doc.setFillColor(TAN[0], TAN[1], TAN[2]);
  doc.rect(0, 80, pw, 4, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(title, margin, 45);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(subtitle, margin, 65);
}

/** Desenha cards de indicadores com barra lateral colorida */
function drawKpiCard(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: number, color: RGB) {
  doc.setFillColor(250, 250, 250);
  doc.rect(x, y, w, h, "F");
  doc.setFillColor(color[0], color[1], color[2]);
  doc.rect(x, y, 4, h, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(label, x + 12, y + 18);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text(money(value), x + 12, y + 42);
}

function sectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text(text, x, y);
  doc.setFillColor(TAN[0], TAN[1], TAN[2]);
  doc.rect(x, y + 4, 30, 2, "F");
}

/** Agrega categorias de múltiplos meses em centavos para o consolidado final */
function consolidatePeriodCategories(data: ReportDataset, groupKey: "despesaCategories" | "fixedCategories" | "variableCategories" | "investimentoCategories"): CategoryRow[] {
  const map = new Map<string, { name: string; cents: number }>();
  for (const m of data.months) {
    for (const c of m[groupKey]) {
      const existing = map.get(c.id) || { name: c.name, cents: 0 };
      existing.cents += c.cents;
      map.set(c.id, existing);
    }
  }
  const totalCents = [...map.values()].reduce((s, v) => s + v.cents, 0);
  return [...map.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([id, d]) => ({ 
      id, 
      name: d.name, 
      cents: d.cents, 
      value: centsToNumber(d.cents), 
      pct: totalCents ? (d.cents / totalCents) * 100 : 0 
    }));
}

/* =========================================================================
 * MODELO — RELATÓRIO DE GASTOS FIXOS E VARIÁVEIS (EXECUTIVO)
 * ========================================================================= */
export async function generateFixedVariableReport(data: ReportDataset) {
  assertReportDataset(data);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pw - margin * 2;

  // 1. CAPA / RESUMO INICIAL
  drawReportHeader(doc, "Relatório de Gastos e Investimentos", data.periodLabel, pw, margin);
  
  let y = 110;
  
  // Executive Cards for Period Totals
  const cardW = (contentW - 20) / 3;
  const cardH = 60;
  const mainCards = [
    { label: "TOTAL MOVIMENTADO", value: data.totals.total, color: NAVY },
    { label: "TOTAL DE DESPESAS", value: data.totals.despesa, color: RED },
    { label: "TOTAL INVESTIDO", value: data.totals.investimento, color: BLUE },
  ];

  mainCards.forEach((c, i) => {
    const x = margin + i * (cardW + 10);
    drawKpiCard(doc, x, y, cardW, cardH, c.label, c.value, c.color);
  });

  y += cardH + 20;

  const subCards = [
    { label: "GASTOS FIXOS", value: data.totals.fixed, color: TAN },
    { label: "GASTOS VARIÁVEIS", value: data.totals.variable, color: TAN_LIGHT },
    { label: "NÃO CLASSIFICADOS", value: data.totals.unclassified, color: [150, 150, 150] as RGB },
  ];

  subCards.forEach((c, i) => {
    const x = margin + i * (cardW + 10);
    drawKpiCard(doc, x, y, cardW, cardH, c.label, c.value, c.color);
  });

  y += cardH + 40;

  // Comparativo Mensal Compacto
  sectionTitle(doc, "Comparativo Mensal do Período", margin, y);
  y += 20;
  
  const comparisonBody = data.months.map(m => [
    `${m.label}/${m.year}`,
    money(m.despesa),
    money(m.fixed),
    money(m.variable),
    money(m.investimento),
    money(m.total)
  ]);
  
  autoTable(doc, {
    startY: y,
    head: [["Mês", "Despesas", "Fixos", "Variáveis", "Investimento", "Total"]],
    body: comparisonBody,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 5, halign: "right" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
    margin: { left: margin, right: margin }
  });

  y = lastY(doc) + 40;

  // 2. DETALHAMENTO MENSAL
  for (const m of data.months) {
    doc.addPage();
    drawReportHeader(doc, `${m.label.toUpperCase()} ${m.year}`, "Detalhamento Mensal", pw, margin);
    y = 110;

    // Monthly KPIs
    const mCards = [
      { label: "TOTAL DO MÊS", value: m.total, color: NAVY },
      { label: "DESPESAS", value: m.despesa, color: RED },
      { label: "INVESTIMENTOS", value: m.investimento, color: BLUE },
    ];
    mCards.forEach((c, i) => {
      const x = margin + i * (cardW + 10);
      drawKpiCard(doc, x, y, cardW, cardH, c.label, c.value, c.color);
    });
    
    y += cardH + 30;

    // Financial Groups Sections
    const groups = [
      { label: "DESPESAS", value: m.despesa, categories: m.despesaCategories, color: RED },
      { label: "GASTOS FIXOS", value: m.fixed, categories: m.fixedCategories, color: TAN },
      { label: "GASTOS VARIÁVEIS", value: m.variable, categories: m.variableCategories, color: TAN_LIGHT },
      { label: "INVESTIMENTOS", value: m.investimento, categories: m.investimentoCategories, color: BLUE },
    ];

    for (const g of groups) {
      if (y + 110 > ph - margin) { doc.addPage(); y = margin + 20; }
      
      // Group Header
      doc.setFillColor(g.color[0], g.color[1], g.color[2]);
      doc.rect(margin, y, contentW, 25, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(g.color === TAN || g.color === BLUE || g.color === RED ? 255 : 60);
      doc.text(g.label, margin + 10, y + 16);
      doc.text(money(g.value), pw - margin - 10, y + 16, { align: "right" });
      y += 30;

      // Brief composition description with values
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      
      const validCats = g.categories.filter(c => c.name !== UNCATEGORIZED && !c.name.includes("Não identificado"));
      const topCats = validCats.slice(0, 5);
      
      if (topCats.length > 0) {
        const desc = "Principais categorias: " + topCats.map(c => `${c.name} (${money(c.value)})`).join(", ") + ".";
        const lines = doc.splitTextToSize(desc, contentW - 10);
        doc.text(lines, margin + 5, y);
        y += lines.length * 12 + 10;
      } else if (g.value > 0) {
        doc.text("Lançamentos sem categoria específica.", margin + 5, y);
        y += 20;
      } else {
        doc.text("Sem movimentação neste grupo.", margin + 5, y);
        y += 20;
      }

      const uncategorized = g.categories.find(c => c.name === UNCATEGORIZED || c.name.includes("Não identificado"));
      if (uncategorized && uncategorized.cents > 0) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(RED[0], RED[1], RED[2]);
        doc.text(`Qualidade de dados: ${money(uncategorized.value)} sem categoria identificada.`, margin + 5, y);
        y += 15;
      }
      
      y += 10;
    }

    if (m.unclassifiedCents > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.text(`Alerta: ${money(m.unclassified)} não possuem classificação entre fixo/variável/despesa.`, margin, y);
      y += 20;
    }
  }

  // 3. CONSOLIDADO FINAL
  doc.addPage();
  drawReportHeader(doc, "CONSOLIDADO DO PERÍODO", data.periodLabel, pw, margin);
  y = 110;

  const finalCards = [
    { label: "TOTAL DO PERÍODO", value: data.totals.total, color: NAVY },
    { label: "TOTAL DE DESPESAS", value: data.totals.despesa, color: RED },
    { label: "TOTAL INVESTIDO", value: data.totals.investimento, color: BLUE },
  ];
  finalCards.forEach((c, i) => {
    const x = margin + i * (cardW + 10);
    drawKpiCard(doc, x, y, cardW, cardH, c.label, c.value, c.color);
  });
  
  y += cardH + 40;

  // Consolidated Composition Analysis
  sectionTitle(doc, "Composição Consolidada", margin, y);
  y += 25;

  const consolidatedGroups = [
    { label: "Despesas", value: data.totals.despesa, group: "despesaCategories" as const },
    { label: "Gastos Fixos", value: data.totals.fixed, group: "fixedCategories" as const },
    { label: "Gastos Variáveis", value: data.totals.variable, group: "variableCategories" as const },
    { label: "Investimentos", value: data.totals.investimento, group: "investimentoCategories" as const },
  ];

  for (const g of consolidatedGroups) {
    if (y + 100 > ph - margin) { doc.addPage(); y = margin + 20; }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
    doc.text(g.label, margin, y);
    doc.text(money(g.value), pw - margin, y, { align: "right" });
    y += 15;

    const cats = consolidatePeriodCategories(data, g.group);
    const validCats = cats.filter(c => c.name !== UNCATEGORIZED && !c.name.includes("Não identificado"));
    const topCats = validCats.slice(0, 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    
    if (topCats.length > 0) {
      const desc = `Principais categorias: ` + topCats.map(c => `${c.name} (${money(c.value)})`).join(", ") + ".";
      const lines = doc.splitTextToSize(desc, contentW);
      doc.text(lines, margin, y);
      y += lines.length * 12 + 20;
    } else {
      doc.text("Sem categorias detalhadas.", margin, y);
      y += 25;
    }
  }

  doc.save(`relatorio-executivo-${data.from}-a-${data.to}.pdf`);
  return logExport({
    reportKind: "relatorio_gastos_fixos_variaveis",
    format: "pdf",
    filters: { ...data.meta.filters, from: data.from, to: data.to },
    rowCount: data.entries.length,
  });
}

/** 
 * Mantido apenas por compatibilidade com a rota se necessário, 
 * mas o foco é o generateFixedVariableReport.
 */
export async function generateMonthlyExpenseReport(data: ReportDataset) {
  return generateFixedVariableReport(data);
}
