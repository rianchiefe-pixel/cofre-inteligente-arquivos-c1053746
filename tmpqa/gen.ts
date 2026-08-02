import { generateMonthlyExpenseReport, generateFixedVariableReport } from "@/lib/report-templates";
import type { ReportDataset, LedgerEntry } from "@/lib/report-data";

const cats = [["Casa 25/26","Casa 26"],["Alimentação","Comida/Bebidas"],["Alimentação","IFOOD"],["Saúde","Farmácia"],["Educação","Educação"],["Veículos","Combustível"],["Sem categoria definida","Não identificado"]];
const months = ["2026-01","2026-02","2026-03"];
const entries: LedgerEntry[] = [];
let i=0;
for (const mk of months) for (const [c,s] of cats) for (let k=0;k<4;k++){
  i++;
  entries.push({ id:String(i), date:`${mk}-1${k}`, amount: 500+((i*937)%9000), kind: i%5===0?"investimento":"despesa",
    fixed: i%3===0, variable: i%3===1, category:c, subcategory:s, hasCategory: c!=="Sem categoria definida",
    payee:`FORNECEDOR EXEMPLO ${i}`, account: i%5===0?"INVESTIMENTOS":"DESPESAS", rawCategory:s,
    notes:"Forma: Cartão de crédito; Banco/cartão: Safra Visa Infinite; Titular/pagador: 9032/9800; Fatura: FAT-SAFRA" });
}
const { loadReportDataset } = await import("@/lib/report-data");
// monta dataset localmente sem banco
function build(): ReportDataset {
  const mod: any = { from:"2026-01-01", to:"2026-03-31" };
  const pick = (mk:string)=>entries.filter(e=>e.date.startsWith(mk));
  const sum=(l:LedgerEntry[])=>l.reduce((s,e)=>s+e.amount,0);
  const group=(l:LedgerEntry[])=>{const t=sum(l);const m=new Map<string,number>();l.forEach(e=>m.set(e.category,(m.get(e.category)??0)+e.amount));return [...m].sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value,pct:t?value/t*100:0}))};
  const mem=(l:LedgerEntry[])=>{const t=sum(l);const ct=new Map<string,number>();l.forEach(e=>ct.set(e.category,(ct.get(e.category)??0)+e.amount));const m=new Map<string,any>();l.forEach(e=>{const k=e.category+"|"+e.subcategory;const c=m.get(k)??{category:e.category,subcategory:e.subcategory,qty:0,value:0};c.qty++;c.value+=e.amount;m.set(k,c)});return [...m.values()].map(r=>({...r,pctCategory:ct.get(r.category)?r.value/ct.get(r.category)!*100:0,pctKind:t?r.value/t*100:0}))};
  const blk=(l:LedgerEntry[])=>({total:sum(l),categories:group(l),memory:mem(l),uncategorized:l.filter(e=>!e.hasCategory)});
  const ms = months.map(mk=>{const l=pick(mk);const d=l.filter(e=>e.kind==="despesa");const inv=l.filter(e=>e.kind==="investimento");
    return {key:mk,label:["Janeiro","Fevereiro","Março"][months.indexOf(mk)],year:2026,despesas:sum(d),investimentos:sum(inv),total:sum(l),
      fixed:sum(l.filter(e=>e.fixed)),variable:sum(l.filter(e=>e.variable)),fixedCategories:group(l.filter(e=>e.fixed)),variableCategories:group(l.filter(e=>e.variable)),
      despesaBlock:blk(d),investimentoBlock:blk(inv)}});
  return {from:mod.from,to:mod.to,periodLabel:"janeiro a março de 2026",months:ms as any,
    totals:{despesas:ms.reduce((s,m)=>s+m.despesas,0),investimentos:ms.reduce((s,m)=>s+m.investimentos,0),total:ms.reduce((s,m)=>s+m.total,0),fixed:ms.reduce((s,m)=>s+m.fixed,0),variable:ms.reduce((s,m)=>s+m.variable,0)},entries};
}
await generateMonthlyExpenseReport(build());
await generateFixedVariableReport(build());
