import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { axisMoney, drawHBarChart, drawLineChart, type RGB } from "@/lib/report-charts";
import { logExport } from "@/lib/exports";
import { currencyBRL, dateBR } from "@/lib/format";
import { centsToNumber, type CategoryRow, type LedgerEntry, type MonthBlock, type ReportDataset } from "@/lib/report-data";
import { assertReportDataset } from "@/lib/report-validation";

const OLIVE: RGB = [198, 187, 33];
const CREAM: RGB = [235, 230, 200];
const LIGHT_BLUE: RGB = [220, 239, 245];
const BLACK: RGB = [0, 0, 0];
const NAVY: RGB = [56, 75, 107];
const NAVY_TEXT: RGB = [31, 60, 95];
const NAVY_ROW: RGB = [227, 238, 244];
const YELLOW: RGB = [252, 252, 16];
const RED: RGB = [192, 0, 0];
const BLUE: RGB = [46, 117, 182];
const TAN: RGB = [197, 148, 84];
const TAN_LIGHT: RGB = [214, 185, 145];
const KPI_HEAD: RGB = [216, 230, 243];
const KPI_CELL: RGB = [254, 233, 216];

const money = (v: number) => currencyBRL(v);
const pctLabel = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function lastY(doc: jsPDF) {
  return (doc as any).lastAutoTable.finalY as number;
}

function band(doc: jsPDF, y: number, x: number, w: number, text: string, fill: RGB, textColor: RGB, size = 12, height = 22) {
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.rect(x, y, w, height, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text(text, x + w / 2, y + height / 2 + size * 0.35, { align: "center" });
  doc.setTextColor(0, 0, 0);
  return y + height;
}

/* =========================================================================
 * MODELO 1 — RELATÓRIO DE GASTOS (mês, categoria e subcategoria)
 * ========================================================================= */
export async function generateMonthlyExpenseReport(data: ReportDataset, opts?: { title?: string }) {
  assertReportDataset(data);
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentW = pw - margin * 2;

  const periodTitle = data.months.length
    ? `${data.months[0].label.toUpperCase()} A ${data.months[data.months.length - 1].label.toUpperCase()}/${data.months[data.months.length - 1].year}`
    : "PERÍODO SEM LANÇAMENTOS";
  const title = opts?.title ?? `RELATÓRIO DE GASTOS - ${periodTitle}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, pw / 2, margin + 12, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  doc.text("Relatório mensal por mês, categoria e subcategoria, com consolidado final", pw / 2, margin + 30, { align: "center" });
  doc.setTextColor(0, 0, 0);

  // 1. Resumo dos meses
  let y = band(doc, margin + 48, margin + contentW * 0.12, contentW * 0.76, "RESUMO DOS MESES", OLIVE, BLACK, 12);
  const summaryBody = data.months.map((m) => [m.label, money(m.despesas), money(m.investimentos), money(m.total)]);
  summaryBody.push(["TOTAL DO PERÍODO", money(data.totals.despesas), money(data.totals.investimentos), money(data.totals.total)]);
  autoTable(doc, {
    startY: y + 8,
    head: [["Mês", "Total de despesas", "Total de investimentos", "Total do mês"]],
    body: summaryBody,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, halign: "center", lineColor: [150, 150, 150], lineWidth: 0.4 },
    headStyles: { fillColor: OLIVE, textColor: BLACK, fontStyle: "bold", halign: "center" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" }, 1: { halign: "left" }, 2: { halign: "left" }, 3: { halign: "left" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === summaryBody.length - 1) {
        d.cell.styles.fillColor = CREAM;
        d.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: margin + contentW * 0.12, right: margin + contentW * 0.12 },
    tableWidth: contentW * 0.76,
  });

  const kindSections: Array<{ key: "despesaBlock" | "investimentoBlock"; label: string }> = [
    { key: "despesaBlock", label: "Despesas" },
    { key: "investimentoBlock", label: "Investimentos" },
  ];

  for (const m of data.months) {
    doc.addPage();
    y = band(doc, margin, margin + contentW * 0.3, contentW * 0.4, m.label.toUpperCase(), OLIVE, BLACK, 13);
    const typeBody = [
      ["Despesas", money(m.despesas), pctLabel(m.total ? (m.despesas / m.total) * 100 : 0)],
      ["Investimentos", money(m.investimentos), pctLabel(m.total ? (m.investimentos / m.total) * 100 : 0)],
      ["TOTAL DO MÊS", money(m.total), pctLabel(m.total ? 100 : 0)],
    ];
    autoTable(doc, {
      startY: y + 10,
      head: [["Tipo", "Valor no mês", "% do mês"]],
      body: typeBody,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5, lineColor: [150, 150, 150], lineWidth: 0.4 },
      headStyles: { fillColor: OLIVE, textColor: BLACK, fontStyle: "bold", halign: "center" },
      columnStyles: { 0: { fontStyle: "bold" } },
      didParseCell: (d) => {
        if (d.section === "body" && d.row.index === 2) {
          d.cell.styles.fillColor = CREAM;
          d.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: margin + contentW * 0.28, right: margin + contentW * 0.28 },
      tableWidth: contentW * 0.44,
    });
    y = lastY(doc) + 18;

    for (const section of kindSections) {
      const block = m[section.key];
      if (!block.categories.length) continue;

      doc.addPage();
      y = band(doc, margin, margin, contentW, `${section.label} - ${m.label}`, BLACK, [255, 255, 255], 12, 24);
      y += 14;

      // Gráfico por categoria
      const chartItems = block.categories
        .slice()
        .sort((a, b) => a.value - b.value)
        .map((c) => ({ label: c.name, value: c.value, valueLabel: money(c.value) }));
      const chartH = Math.max(200, ph - y - margin - 10);
      drawHBarChart(doc, {
        x: margin,
        y,
        w: contentW,
        h: chartH,
        title: `${section.label} por categoria - ${m.label}`,
        items: chartItems,
        axisTitle: "Valor (R$)",
        axisFormatter: axisMoney,
        outlineBars: true,
      });

      // Tabela de categorias
      doc.addPage();
      y = margin;
      const catBody = block.categories.map((c) => [c.name, money(c.value), pctLabel(c.pct)]);
      catBody.push(["TOTAL", money(block.total), pctLabel(block.total ? 100 : 0)]);
      autoTable(doc, {
        startY: y,
        head: [["Categoria", "Valor", "% do tipo"]],
        body: catBody,
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 4, lineColor: [150, 150, 150], lineWidth: 0.4 },
        headStyles: { fillColor: OLIVE, textColor: BLACK, fontStyle: "bold", halign: "center" },
        columnStyles: { 0: { cellWidth: contentW * 0.5 }, 1: { cellWidth: contentW * 0.25 }, 2: { cellWidth: contentW * 0.25 } },
        didParseCell: (d) => {
          if (d.section === "body" && d.row.index === catBody.length - 1) {
            d.cell.styles.fillColor = CREAM;
            d.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: margin, right: margin },
      });
      y = lastY(doc) + 24;

      // Memória de cálculo
      if (y > ph - 140) { doc.addPage(); y = margin; }
      y = band(doc, y, margin, contentW, `Memória de cálculo - ${section.label}`, LIGHT_BLUE, NAVY_TEXT, 11, 22);
      autoTable(doc, {
        startY: y + 8,
        head: [["Categoria", "Subcategoria", "Qtd.", "Valor", "% da categoria", "% do tipo"]],
        body: block.memory.map((r) => [r.category, r.subcategory, String(r.qty), money(r.value), pctLabel(r.pctCategory), pctLabel(r.pctKind)]),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3.5, lineColor: [150, 150, 150], lineWidth: 0.4 },
        headStyles: { fillColor: OLIVE, textColor: BLACK, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { cellWidth: contentW * 0.2 },
          1: { cellWidth: contentW * 0.29 },
          2: { cellWidth: contentW * 0.07, halign: "center" },
          3: { cellWidth: contentW * 0.15 },
          4: { cellWidth: contentW * 0.14 },
          5: { cellWidth: contentW * 0.13 },
        },
        margin: { left: margin, right: margin },
      });
      y = lastY(doc) + 24;

      // Lançamentos sem categoria definida
      if (block.uncategorized.length) {
        if (y > ph - 160) { doc.addPage(); y = margin; }
        y = band(doc, y, margin, contentW, `Lançamentos sem categoria definida - ${section.label} - ${m.label}`, LIGHT_BLUE, NAVY_TEXT, 11, 22);
        autoTable(doc, {
          startY: y + 8,
          head: [["Id", "Data", "Valor", "De/Para", "Categoria na planilha", "Conta", "Notas"]],
          body: block.uncategorized.map((e: LedgerEntry, i) => [
            String(i + 1),
            dateBR(e.date),
            money(e.amount),
            e.payee,
            e.rawCategory,
            e.account,
            e.notes,
          ]),
          theme: "grid",
          styles: { fontSize: 6.5, cellPadding: 3, overflow: "linebreak", lineColor: [150, 150, 150], lineWidth: 0.4 },
          headStyles: { fillColor: OLIVE, textColor: BLACK, fontStyle: "bold", halign: "center" },
          columnStyles: {
            0: { cellWidth: contentW * 0.04, halign: "center" },
            1: { cellWidth: contentW * 0.07, halign: "center" },
            2: { cellWidth: contentW * 0.08, halign: "center" },
            3: { cellWidth: contentW * 0.17 },
            4: { cellWidth: contentW * 0.13 },
            5: { cellWidth: contentW * 0.09, halign: "center" },
            6: { cellWidth: contentW * 0.37 },
          },
          margin: { left: margin, right: margin },
        });
      }
    }
  }

  // Consolidado final
  doc.addPage();
  y = band(doc, margin, margin + contentW * 0.2, contentW * 0.6, "CONSOLIDADO DO PERÍODO", OLIVE, BLACK, 13);
  const consolidated = consolidateCategories(data, "despesaBlock");
  const consolidatedInv = consolidateCategories(data, "investimentoBlock");
  autoTable(doc, {
    startY: y + 10,
    head: [["Tipo", "Total do período", "% do período"]],
    body: [
      ["Despesas", money(data.totals.despesas), pctLabel(data.totals.total ? (data.totals.despesas / data.totals.total) * 100 : 0)],
      ["Investimentos", money(data.totals.investimentos), pctLabel(data.totals.total ? (data.totals.investimentos / data.totals.total) * 100 : 0)],
      ["TOTAL", money(data.totals.total), pctLabel(data.totals.total ? 100 : 0)],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, lineColor: [150, 150, 150], lineWidth: 0.4 },
    headStyles: { fillColor: OLIVE, textColor: BLACK, fontStyle: "bold", halign: "center" },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === 2) { d.cell.styles.fillColor = CREAM; d.cell.styles.fontStyle = "bold"; }
    },
    margin: { left: margin + contentW * 0.28, right: margin + contentW * 0.28 },
    tableWidth: contentW * 0.44,
  });
  y = lastY(doc) + 22;

  for (const group of [
    { label: "Despesas", rows: consolidated },
    { label: "Investimentos", rows: consolidatedInv },
  ]) {
    if (!group.rows.length) continue;
    if (y > ph - 150) { doc.addPage(); y = margin; }
    y = band(doc, y, margin, contentW, `Consolidado por categoria - ${group.label}`, LIGHT_BLUE, NAVY_TEXT, 11, 22);
    const total = group.rows.reduce((s, r) => s + r.value, 0);
    const body = group.rows.map((r) => [r.name, money(r.value), pctLabel(r.pct)]);
    body.push(["TOTAL", money(total), pctLabel(total ? 100 : 0)]);
    autoTable(doc, {
      startY: y + 8,
      head: [["Categoria", "Valor", "% do tipo"]],
      body,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 4, lineColor: [150, 150, 150], lineWidth: 0.4 },
      headStyles: { fillColor: OLIVE, textColor: BLACK, fontStyle: "bold", halign: "center" },
      columnStyles: { 0: { cellWidth: contentW * 0.5 }, 1: { cellWidth: contentW * 0.25 }, 2: { cellWidth: contentW * 0.25 } },
      didParseCell: (d) => {
        if (d.section === "body" && d.row.index === body.length - 1) { d.cell.styles.fillColor = CREAM; d.cell.styles.fontStyle = "bold"; }
      },
      margin: { left: margin, right: margin },
    });
    y = lastY(doc) + 22;
  }

  doc.save(`relatorio-gastos-${data.from}-a-${data.to}.pdf`);
  return logExport({ reportKind: "relatorio_gastos_mensal", format: "pdf", filters: { from: data.from, to: data.to }, rowCount: data.entries.length });
}

function consolidateCategories(data: ReportDataset, key: "despesaBlock" | "investimentoBlock"): CategoryRow[] {
  const map = new Map<string, number>();
  for (const m of data.months) for (const c of m[key].categories) map.set(c.name, (map.get(c.name) ?? 0) + c.value);
  const total = [...map.values()].reduce((s, v) => s + v, 0);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, cents: Math.round(value * 100), pct: total ? (value / total) * 100 : 0 }));
}

/* =========================================================================
 * MODELO 2 — RELATÓRIO DE GASTOS FIXOS E VARIÁVEIS
 * Um único snapshot (ReportDataset) alimenta tabelas, KPIs e gráficos.
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
    { label: "TOTAL DE DESPESAS", value: data.totals.despesas, color: RED },
    { label: "TOTAL INVESTIDO", value: data.totals.investimentos, color: BLUE },
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
    money(m.fixed),
    money(m.variable),
    money(m.investimentos),
    money(m.total)
  ]);
  
  autoTable(doc, {
    startY: y,
    head: [["Mês", "Fixos", "Variáveis", "Investimentos", "Total"]],
    body: comparisonBody,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 5, halign: "right" },
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
      { label: "DESPESAS", value: m.despesas, color: RED },
      { label: "INVESTIMENTOS", value: m.investimentos, color: BLUE },
    ];
    mCards.forEach((c, i) => {
      const x = margin + i * (cardW + 10);
      drawKpiCard(doc, x, y, cardW, cardH, c.label, c.value, c.color);
    });
    
    y += cardH + 30;

    // Financial Types Sections
    const groups = [
      { label: "GASTOS FIXOS", value: m.fixed, categories: m.fixedCategories, color: TAN },
      { label: "GASTOS VARIÁVEIS", value: m.variable, categories: m.variableCategories, color: TAN_LIGHT },
      { label: "INVESTIMENTOS", value: m.investimentos, categories: m.investimentoBlock.categories, color: BLUE },
    ];

    for (const g of groups) {
      if (y + 100 > ph - margin) { doc.addPage(); y = margin + 20; }
      
      // Group Header
      doc.setFillColor(g.color[0], g.color[1], g.color[2]);
      doc.rect(margin, y, contentW, 25, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(g.color === TAN || g.color === BLUE ? 255 : 60);
      doc.text(g.label, margin + 10, y + 16);
      doc.text(money(g.value), pw - margin - 10, y + 16, { align: "right" });
      y += 30;

      // Brief composition description
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const topCats = g.categories.slice(0, 5).map(c => c.name);
      const desc = topCats.length 
        ? `Principais componentes: ${topCats.join(", ")}.`
        : "Sem lançamentos identificados para este grupo.";
      
      doc.text(desc, margin + 5, y);
      y += 25;
    }

    if (m.unclassifiedCents > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.text(`Atenção: ${money(m.unclassified)} permanecem sem classificação entre fixo e variável.`, margin, y);
      y += 20;
    }
  }

  // 3. CONSOLIDADO FINAL
  doc.addPage();
  drawReportHeader(doc, "CONSOLIDADO DO PERÍODO", data.periodLabel, pw, margin);
  y = 110;

  const finalCards = [
    { label: "TOTAL DO PERÍODO", value: data.totals.total, color: NAVY },
    { label: "DESPESAS", value: data.totals.despesas, color: RED },
    { label: "INVESTIMENTOS", value: data.totals.investimentos, color: BLUE },
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
    { label: "Gastos Fixos", value: data.totals.fixed, categories: consolidatePeriodCategories(data, "fixedCategories") },
    { label: "Gastos Variáveis", value: data.totals.variable, categories: consolidatePeriodCategories(data, "variableCategories") },
    { label: "Investimentos", value: data.totals.investimentos, categories: consolidatePeriodCategories(data, "investimentoBlock") },
  ];

  for (const g of consolidatedGroups) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
    doc.text(g.label, margin, y);
    doc.text(money(g.value), pw - margin, y, { align: "right" });
    y += 15;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const topCats = g.categories.slice(0, 8).map(c => c.name);
    const desc = topCats.length 
      ? `Principais categorias no período: ${topCats.join(", ")}.`
      : "Nenhuma categoria registrada.";
    
    const lines = doc.splitTextToSize(desc, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 20;
  }

  doc.save(`relatorio-executivo-${data.from}-a-${data.to}.pdf`);
  return logExport({
    reportKind: "relatorio_gastos_fixos_variaveis",
    format: "pdf",
    filters: { ...data.meta.filters, from: data.from, to: data.to },
    rowCount: data.entries.length,
  });
}

function drawReportHeader(doc: jsPDF, title: string, subtitle: string, pw: number, margin: number) {
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, pw, 80, "F");
  doc.setFillColor(TAN[0], TAN[1], TAN[2]);
  doc.rect(0, 80, pw, 3, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 45);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(subtitle.toUpperCase(), margin, 65);
  
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, pw - margin, 45, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

function drawKpiCard(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: number, color: RGB) {
  doc.setFillColor(248, 249, 252);
  doc.roundedRect(x, y, w, h, 3, 3, "F");
  
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(1.5);
  doc.line(x, y, x, y + h);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(label, x + 10, y + 18);
  
  doc.setFontSize(13);
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text(money(value), x + 10, y + 42);
}

function consolidatePeriodCategories(data: ReportDataset, source: "fixedCategories" | "variableCategories" | "investimentoBlock"): CategoryRow[] {
  const map = new Map<string, number>();
  for (const m of data.months) {
    const cats = source === "investimentoBlock" ? m.investimentoBlock.categories : m[source];
    for (const c of cats) {
      map.set(c.name, (map.get(c.name) ?? 0) + c.cents);
    }
  }
  const totalCents = [...map.values()].reduce((s, v) => s + v, 0);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, cents]) => ({
      name,
      cents,
      value: centsToNumber(cents),
      pct: totalCents ? (cents / totalCents) * 100 : 0
    }));
}

function sectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text(text, x, y);
  doc.setTextColor(0, 0, 0);
  return y;
}
