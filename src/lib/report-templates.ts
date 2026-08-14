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
const GRAY_LIGHT: RGB = [200, 200, 200];

const money = (v: number) => currencyBRL(v);

function lastY(doc: jsPDF) {
  return (doc as any).lastAutoTable.finalY as number;
}

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

function consolidatePeriodCategories(data: ReportDataset, groupKey: "despesaCategories" | "fixedCategories" | "variableCategories" | "otherExpenseCategories" | "investimentoCategories"): CategoryRow[] {
  const map = new Map<string, { name: string; cents: number }>();
  for (const m of data.months) {
    const categories = (m as any)[groupKey] as CategoryRow[] || [];
    for (const c of categories) {
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

function addFooter(doc: jsPDF, profileLabel: string, pw: number, ph: number, margin: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const date = new Date().toLocaleDateString("pt-BR");
  doc.text(`Perfil: ${profileLabel} | Gerado em ${date}`, margin, ph - 20);
  doc.text(`Página ${doc.internal.pages.length - 1}`, pw - margin, ph - 20, { align: "right" });
}

export async function generateFixedVariableReport(data: ReportDataset) {
  assertReportDataset(data);
  const isPessoal = data.meta.filters.profileId === 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const profileLabel = isPessoal ? "Pessoa Física — Pessoal" : "Holding";
  
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pw - margin * 2;

  const drawFinancialSectionFn = (params: {
    y: number;
    label: string;
    value: number;
    categories: CategoryRow[];
    color: RGB;
    compactTable?: boolean;
  }) => {
    let curY = params.y;
    const HEADER_HEIGHT = 22;
    const SECTION_GAP = 20;

    if (curY + 100 > ph - margin) {
      doc.addPage();
      addFooter(doc, profileLabel, pw, ph, margin);
      curY = margin + 20;
    }

    doc.setFillColor(params.color[0], params.color[1], params.color[2]);
    doc.rect(margin, curY, contentW, HEADER_HEIGHT, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const isDark = params.color === NAVY || params.color === BLUE || params.color === RED;
    doc.setTextColor(isDark ? 255 : 60);
    doc.text(params.label, margin + 10, curY + 15);
    doc.text(money(params.value), pw - margin - 10, curY + 15, { align: "right" });

    curY += HEADER_HEIGHT + 8;

    if (params.categories.length > 0) {
      const tableData = params.categories.map(c => [
        c.name.toUpperCase(),
        money(c.value)
      ]);

      autoTable(doc, {
        startY: curY,
        body: tableData,
        theme: "plain",
        styles: { fontSize: params.compactTable ? 7 : 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: contentW * 0.75 },
          1: { halign: "right", fontStyle: "bold", cellWidth: contentW * 0.25 }
        },
        margin: { left: margin, right: margin }
      });
      curY = lastY(doc) + SECTION_GAP;
    } else {
      curY += SECTION_GAP;
    }

    return curY;
  };

  const drawCompositionBox = (doc: jsPDF, y: number, totals: { despesa: number; fixed: number; variable: number; otherExpense: number }) => {
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y, contentW, 70, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(NAVY_TEXT[0], NAVY_TEXT[1], NAVY_TEXT[2]);
    doc.text("COMPOSIÇÃO DAS DESPESAS", margin + 10, y + 15);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Despesas totais ......................................................................... ${money(totals.despesa)}`, margin + 15, y + 30);
    doc.text(`├─ Gastos fixos ........................................................................... ${money(totals.fixed)}`, margin + 15, y + 42);
    doc.text(`├─ Gastos variáveis ................................................................... ${money(totals.variable)}`, margin + 15, y + 54);
    doc.text(`└─ Outras despesas ................................................................... ${money(totals.otherExpense)}`, margin + 15, y + 66);
    
    return y + 85;
  };

  // 1. CAPA / RESUMO INICIAL
  const reportTitle = isPessoal ? "RELATÓRIO FINANCEIRO — PESSOA FÍSICA" : "RELATÓRIO FINANCEIRO — HOLDING";
  drawReportHeader(doc, reportTitle, `Perfil: ${profileLabel} | Período: ${data.periodLabel}`, pw, margin);
  
  let y = 110;
  
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

  if (isPessoal) {
    const subCards = [
      { label: "GASTOS FIXOS", value: data.totals.fixed, color: TAN },
      { label: "GASTOS VARIÁVEIS", value: data.totals.variable, color: TAN_LIGHT },
      { label: "OUTRAS DESPESAS", value: data.totals.otherExpense, color: GRAY_LIGHT },
    ];

    subCards.forEach((c, i) => {
      const x = margin + i * (cardW + 10);
      drawKpiCard(doc, x, y, cardW, cardH, c.label, c.value, c.color);
    });
    y += cardH + 20;
    
    y = drawCompositionBox(doc, y, {
      despesa: data.totals.despesa,
      fixed: data.totals.fixed,
      variable: data.totals.variable,
      otherExpense: data.totals.otherExpense
    });
  }

  y += 20;

  // Comparativo Mensal
  sectionTitle(doc, "Comparativo Mensal do Período", margin, y);
  y += 20;
  
  const comparisonHead = isPessoal 
    ? [["Mês", "Despesas", "Fixos", "Variáveis", "Outras", "Invest.", "Total"]]
    : [["Mês", "Despesas", "Investimentos", "Total"]];
    
  const comparisonBody = data.months.map(m => isPessoal 
    ? [
        `${m.label}/${m.year}`,
        money(m.despesa),
        money(m.fixed),
        money(m.variable),
        money(m.otherExpense),
        money(m.investimento),
        money(m.total)
      ]
    : [
        `${m.label}/${m.year}`,
        money(m.despesa),
        money(m.investimento),
        money(m.total)
      ]
  );
  
  autoTable(doc, {
    startY: y,
    head: comparisonHead,
    body: comparisonBody,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 5, halign: "right" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
    margin: { left: margin, right: margin }
  });

  addFooter(doc, profileLabel, pw, ph, margin);

  // 2. DETALHAMENTO MENSAL
  for (const m of data.months) {
    doc.addPage();
    drawReportHeader(doc, `${m.label.toUpperCase()} ${m.year}`, "Detalhamento Mensal", pw, margin);
    y = 110;

    const mCards = [
      { label: "TOTAL DO MÊS", value: m.total, color: NAVY },
      { label: "DESPESAS", value: m.despesa, color: RED },
      { label: "INVESTIMENTOS", value: m.investimento, color: BLUE },
    ];
    mCards.forEach((c, i) => {
      const x = margin + i * (cardW + 10);
      drawKpiCard(doc, x, y, cardW, cardH, c.label, c.value, c.color);
    });
    
    y += cardH + 20;

    if (isPessoal) {
      y = drawCompositionBox(doc, y, {
        despesa: m.despesa,
        fixed: m.fixed,
        variable: m.variable,
        otherExpense: m.otherExpense
      });

      const groups = [
        { label: "GASTOS FIXOS", value: m.fixed, categories: m.fixedCategories, color: TAN, compactTable: true },
        { label: "GASTOS VARIÁVEIS", value: m.variable, categories: m.variableCategories, color: TAN_LIGHT, compactTable: true },
        { label: "OUTRAS DESPESAS", value: m.otherExpense, categories: m.otherExpenseCategories, color: GRAY_LIGHT, compactTable: true },
        { label: "INVESTIMENTOS", value: m.investimento, categories: m.investimentoCategories, color: BLUE, compactTable: false },
      ];

      for (const g of groups) {
        y = drawFinancialSectionFn({
          y,
          label: g.label,
          value: g.value,
          categories: g.categories,
          color: g.color
        });
      }
    } else {
      // Holding View
      const groups = [
        { label: "DESPESAS", value: m.despesa, categories: m.despesaCategories, color: RED, compactTable: false },
        { label: "INVESTIMENTOS", value: m.investimento, categories: m.investimentoCategories, color: BLUE, compactTable: false },
      ];

      for (const g of groups) {
        y = drawFinancialSectionFn({
          y,
          label: g.label,
          value: g.value,
          categories: g.categories,
          color: g.color
        });
      }
    }
    addFooter(doc, profileLabel, pw, ph, margin);
  }

  // 3. CONSOLIDADO FINAL
  doc.addPage();
  drawReportHeader(doc, `CONSOLIDADO DO PERÍODO — ${isPessoal ? 'PESSOAL' : 'HOLDING'}`, data.periodLabel, pw, margin);
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
  
  y += cardH + 30;

  if (isPessoal) {
    y = drawCompositionBox(doc, y, {
      despesa: data.totals.despesa,
      fixed: data.totals.fixed,
      variable: data.totals.variable,
      otherExpense: data.totals.otherExpense
    });

    const consolidatedGroups = [
      { label: "Gastos Fixos", value: data.totals.fixed, color: TAN, group: "fixedCategories" as const },
      { label: "Gastos Variáveis", value: data.totals.variable, color: TAN_LIGHT, group: "variableCategories" as const },
      { label: "Outras Despesas", value: data.totals.otherExpense, color: GRAY_LIGHT, group: "otherExpenseCategories" as const },
      { label: "Investimentos", value: data.totals.investimento, color: BLUE, group: "investimentoCategories" as const },
    ];

    for (const g of consolidatedGroups) {
      const cats = consolidatePeriodCategories(data, g.group);
      y = drawFinancialSectionFn({
        y,
        label: g.label.toUpperCase(),
        value: g.value,
        categories: cats,
        color: g.color,
        compactTable: g.label !== "Investimentos"
      });
    }
  } else {
    // Holding View
    const consolidatedGroups = [
      { label: "Despesas Consolidadas", value: data.totals.despesa, color: RED, group: "despesaCategories" as const },
      { label: "Investimentos Consolidados", value: data.totals.investimento, color: BLUE, group: "investimentoCategories" as const },
    ];

    for (const g of consolidatedGroups) {
      const cats = consolidatePeriodCategories(data, g.group);
      y = drawFinancialSectionFn({
        y,
        label: g.label.toUpperCase(),
        value: g.value,
        categories: cats,
        color: g.color,
        compactTable: false
      });
    }
  }

  // 4. TABELA ANALÍTICA: CUSTO POR IMÓVEL (Regra 2, 7, 11, 12)
  if (data.propertyBreakdown && data.propertyBreakdown.length > 0) {
    const tableTitle = isPessoal ? "CUSTO POR IMÓVEL — PESSOA FÍSICA" : "CUSTO POR IMÓVEL — HOLDING";
    
    if (y + 100 > ph - margin) {
      doc.addPage();
      addFooter(doc, profileLabel, pw, ph, margin);
      y = margin + 20;
    }

    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(margin, y, contentW, 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.text(tableTitle, margin + 10, y + 15);

    y += 22 + 8;

    const propertyTableBody = data.propertyBreakdown.map(p => [
      p.propertyName.toUpperCase(),
      money(p.despesa),
      money(p.investimento),
      money(p.total)
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Imóvel / Origem", "Despesas", "Investimentos", "Total"]],
      body: propertyTableBody,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [80, 80, 80], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { cellWidth: contentW * 0.4 },
        1: { halign: "right", cellWidth: contentW * 0.2 },
        2: { halign: "right", cellWidth: contentW * 0.2 },
        3: { halign: "right", fontStyle: "bold", cellWidth: contentW * 0.2 }
      },
      margin: { left: margin, right: margin }
    });
    
    y = lastY(doc) + 20;
  }

  addFooter(doc, profileLabel, pw, ph, margin);

  doc.save(`Relatorio-${isPessoal ? 'Pessoal' : 'Holding'}-${data.from}-a-${data.to}-${Date.now()}.pdf`);
  return logExport({
    reportKind: "relatorio_gastos_fixos_variaveis",
    format: "pdf",
    filters: { ...data.meta.filters, from: data.from, to: data.to },
    rowCount: data.entries.length,
  });
}

export async function generateMonthlyExpenseReport(data: ReportDataset) {
  return generateFixedVariableReport(data);
}