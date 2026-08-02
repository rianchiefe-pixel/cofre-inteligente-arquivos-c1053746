import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { axisMoney, drawHBarChart, drawLineChart, type RGB } from "@/lib/report-charts";
import { logExport } from "@/lib/exports";
import { currencyBRL, dateBR } from "@/lib/format";
import type { CategoryRow, LedgerEntry, MonthBlock, ReportDataset } from "@/lib/report-data";

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
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 }));
}

/* =========================================================================
 * MODELO 2 — RELATÓRIO DE GASTOS FIXOS E VARIÁVEIS
 * Um único snapshot (ReportDataset) alimenta tabelas, KPIs e gráficos.
 * ========================================================================= */
export async function generateFixedVariableReport(data: ReportDataset) {
  const validation = assertReportDataset(data);

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pw - margin * 2;
  const bottom = ph - margin;

  const ensure = (y: number, needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      return margin;
    }
    return y;
  };

  // Cabeçalho
  let y = margin + 10;
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(1.2);
  doc.line(margin, y, margin + contentW, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text("RELATÓRIO DE GASTOS FIXOS E VARIÁVEIS", pw / 2, y + 24, { align: "center" });
  doc.setLineWidth(0.8);
  doc.line(margin, y + 36, margin + contentW, y + 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text(`Período: ${data.periodLabel}`, pw / 2, y + 56, { align: "center" });
  y += 78;

  // 1. Resumo geral — Mês | Fixos | Variáveis | Total do mês
  y = sectionTitle(doc, "1. Resumo geral", margin, y);
  const resumoBody = data.months.map((m) => [
    `${m.label} de ${m.year}`,
    money(m.fixed),
    money(m.variable),
    money(centsToNumber(m.fixedCents + m.variableCents)),
  ]);
  resumoBody.push([
    "TOTAL DO PERÍODO",
    money(data.totals.fixed),
    money(data.totals.variable),
    money(centsToNumber(data.totals.fixedCents + data.totals.variableCents)),
  ]);
  autoTable(doc, {
    startY: y + 10,
    head: [["Mês", "Gastos fixos", "Gastos variáveis", "Total do mês"]],
    body: resumoBody,
    theme: "grid",
    rowPageBreak: "avoid",
    styles: { fontSize: 9.5, cellPadding: 5, lineColor: [180, 190, 205], lineWidth: 0.4, textColor: [20, 20, 20] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    columnStyles: { 0: { halign: "left" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === resumoBody.length - 1) {
        d.cell.styles.fillColor = NAVY_ROW;
        d.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: margin, right: margin },
  });
  y = lastY(doc) + 26;

  // 2. Detalhamento mensal
  y = ensure(y, 60);
  y = sectionTitle(doc, "2. Detalhamento mensal", margin, y);
  y += 6;

  data.months.forEach((m, idx) => {
    doc.addPage();
    y = drawMonthSection(doc, m, idx + 1, margin, contentW, ph, margin);
  });

  // Lançamentos pendentes de classificação
  if (data.diagnostics.unclassified.length) {
    doc.addPage();
    y = sectionTitle(doc, "Lançamentos pendentes de classificação", margin, margin + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text(
      "Despesas sem classificação de gasto fixo ou variável no lançamento e na categoria. Os valores continuam somados no total de despesas.",
      margin,
      y + 12,
      { maxWidth: contentW },
    );
    doc.setTextColor(0, 0, 0);
    autoTable(doc, {
      startY: y + 28,
      head: [["Data", "Descrição", "Categoria", "Subcategoria", "Valor", "ID do lançamento"]],
      body: data.diagnostics.unclassified.map((e) => [
        dateBR(e.date),
        e.notes || e.payee,
        e.category,
        e.subcategory,
        money(e.amount),
        e.id,
      ]),
      theme: "grid",
      rowPageBreak: "avoid",
      styles: { fontSize: 7.5, cellPadding: 3.5, overflow: "linebreak", lineColor: [180, 190, 205], lineWidth: 0.4 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { cellWidth: contentW * 0.09, halign: "center" },
        1: { cellWidth: contentW * 0.26 },
        2: { cellWidth: contentW * 0.16 },
        3: { cellWidth: contentW * 0.16 },
        4: { cellWidth: contentW * 0.12, halign: "right" },
        5: { cellWidth: contentW * 0.21, fontSize: 6 },
      },
      margin: { left: margin, right: margin },
    });
  }

  // 3. Consolidado geral
  doc.addPage();
  y = highlightHeading(doc, "3. Consolidado geral", margin, margin + 14);
  const consolidatedBody = [
    ["Gastos fixos", money(data.totals.fixed)],
    ["Gastos variáveis", money(data.totals.variable)],
    ["Gastos não classificados", money(data.totals.unclassified)],
    ["Despesas", money(data.totals.despesas)],
    ["Investimentos", money(data.totals.investimentos)],
    ["Total financeiro do período", money(data.totals.total)],
  ];
  autoTable(doc, {
    startY: y + 12,
    head: [["Indicador", "Valor do período"]],
    body: consolidatedBody,
    theme: "grid",
    rowPageBreak: "avoid",
    styles: { fontSize: 9.5, cellPadding: 5, lineColor: [180, 190, 205], lineWidth: 0.4 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === consolidatedBody.length - 1) {
        d.cell.styles.fillColor = NAVY_ROW;
        d.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: margin, right: margin },
  });
  y = lastY(doc) + 24;

  if (data.months.length) {
    const chartH = Math.min(320, ph - margin - y);
    if (chartH < 220) { doc.addPage(); y = margin; }
    drawLineChart(doc, {
      x: margin,
      y,
      w: contentW,
      h: Math.min(320, ph - margin - y),
      title: "Evolução mensal — despesas, investimentos e gastos fixos/variáveis",
      categories: data.months.map((m) => `${m.label.slice(0, 3)}/${String(m.year).slice(2)}`),
      series: [
        { name: "Total do mês", color: NAVY, values: data.months.map((m) => m.total) },
        { name: "Despesas", color: RED, values: data.months.map((m) => m.despesas) },
        { name: "Investimentos", color: BLUE, values: data.months.map((m) => m.investimentos) },
        { name: "Gastos fixos", color: TAN, values: data.months.map((m) => m.fixed) },
        { name: "Gastos variáveis", color: TAN_LIGHT, values: data.months.map((m) => m.variable) },
      ],
      axisTitle: "Valor (R$)",
    });
  }

  doc.save(`relatorio-gastos-fixos-variaveis-${data.from}-a-${data.to}.pdf`);
  const logged = await logExport({
    reportKind: "relatorio_gastos_fixos_variaveis",
    format: "pdf",
    filters: { from: data.from, to: data.to, ...data.meta.filters },
    rowCount: data.entries.length,
  });
  return { ...logged, warnings: validation.warnings };
}

function sectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text(text, x, y);
  doc.setTextColor(0, 0, 0);
  return y;
}

function highlightHeading(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const w = doc.getTextWidth(text) + 10;
  doc.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
  doc.rect(x, y - 11, w, 17, "F");
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text(text, x + 5, y + 1);
  doc.setTextColor(0, 0, 0);
  return y + 16;
}

function categoryTable(doc: jsPDF, label: string, rows: CategoryRow[], total: number, margin: number, contentW: number, y: number, ph: number) {
  // Nunca deixar o título separado da tabela nem só o cabeçalho no pé da página.
  if (y + 70 > ph - margin) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text(label, margin, y);
  doc.setTextColor(0, 0, 0);
  const body = rows.length ? rows.map((r) => [r.name, money(r.value)]) : [["Sem lançamentos no mês", money(0)]];
  body.push(["TOTAL", money(total)]);
  autoTable(doc, {
    startY: y + 8,
    head: [["Categoria", "Valor"]],
    body,
    theme: "grid",
    rowPageBreak: "avoid",
    styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak", lineColor: [180, 190, 205], lineWidth: 0.4 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    columnStyles: { 0: { cellWidth: contentW * 0.66, halign: "left" }, 1: { halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === body.length - 1) { d.cell.styles.fillColor = NAVY_ROW; d.cell.styles.fontStyle = "bold"; }
    },
    margin: { left: margin, right: margin },
  });
  return lastY(doc) + 18;
}

function drawMonthSection(doc: jsPDF, m: MonthBlock, index: number, margin: number, contentW: number, ph: number, startY: number) {
  let y = startY + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const heading = `2.${index} ${m.label} de ${m.year}`;
  const w = doc.getTextWidth(heading) + 14;
  doc.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
  doc.rect(margin + (contentW - w) / 2, y - 12, w, 18, "F");
  doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
  doc.text(heading, margin + contentW / 2, y + 1, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 26;

  y = categoryTable(doc, "Gastos fixos", m.fixedCategories, m.fixed, margin, contentW, y, ph);
  y = categoryTable(doc, "Gastos variáveis", m.variableCategories, m.variable, margin, contentW, y, ph);
  if (m.unclassifiedCents > 0) {
    y = categoryTable(doc, "Gastos não classificados", m.unclassifiedCategories, m.unclassified, margin, contentW, y, ph);
  }

  // Resumo do mês (KPIs) — mesmos números das tabelas e do gráfico.
  if (y + 80 > ph - margin) { doc.addPage(); y = margin; }
  autoTable(doc, {
    startY: y,
    head: [["Total do mês", "Despesas", "Investimentos", "Gastos Fixos", "Gastos Variáveis"]],
    body: [[money(m.total), money(m.despesas), money(m.investimentos), money(m.fixed), money(m.variable)]],
    theme: "grid",
    rowPageBreak: "avoid",
    styles: { fontSize: 8.5, cellPadding: 6, halign: "center", lineColor: [180, 190, 205], lineWidth: 0.4 },
    headStyles: { fillColor: KPI_HEAD, textColor: NAVY_TEXT, fontStyle: "bold", halign: "center" },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      d.cell.styles.fontStyle = "bold";
      if (d.column.index === 0) d.cell.styles.textColor = NAVY_TEXT;
      if (d.column.index === 1) d.cell.styles.textColor = RED;
      if (d.column.index === 2) d.cell.styles.textColor = BLUE;
      if (d.column.index >= 3) { d.cell.styles.fillColor = KPI_CELL; d.cell.styles.textColor = [60, 40, 20]; }
    },
    margin: { left: margin, right: margin },
  });
  y = lastY(doc) + 22;

  // Comparativo mensal — gráfico inteiro na página, nunca cortado.
  const chartH = 180;
  if (y + chartH > ph - margin) { doc.addPage(); y = margin; }
  drawHBarChart(doc, {
    x: margin,
    y,
    w: contentW,
    h: chartH,
    title: `Comparativo mensal — ${m.label} de ${m.year}`,
    items: [
      { label: "Gastos variáveis", value: m.variable, valueLabel: money(m.variable), color: TAN_LIGHT },
      { label: "Gastos fixos", value: m.fixed, valueLabel: money(m.fixed), color: TAN },
      { label: "Investimentos", value: m.investimentos, valueLabel: money(m.investimentos), color: BLUE },
      { label: "Despesas", value: m.despesas, valueLabel: money(m.despesas), color: RED },
      { label: "Total do mês", value: m.total, valueLabel: money(m.total), color: NAVY },
    ],
    labelWidth: 100,
    valueGap: 96,
    fontSize: 7.5,
    valueFontStyle: "bold",
    axisFormatter: axisMoney,
    frame: false,
  });
  return y + chartH + 10;
}
