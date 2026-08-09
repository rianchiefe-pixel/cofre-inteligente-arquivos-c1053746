import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { ShieldAlert, AlertCircle, Info, Database, ShieldCheck } from "lucide-react";
import { useCan } from "@/lib/permissions";
import { RestrictedArea } from "@/components/role-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_authenticated/app/audit")({
  head: () => ({
    meta: [
      { title: "Auditoria — Meu Cofre" },
      { name: "description", content: "Resultados da auditoria de reconciliação de Janeiro/2026." },
      { property: "og:title", content: "Auditoria — Meu Cofre" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditGate,
});

function AuditGate() {
  const canView = useCan("viewAudit");
  if (!canView) return <RestrictedArea message="Somente proprietário, administrador ou contador podem visualizar a auditoria." />;
  return <AuditPage />;
}

function AuditPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Status da Auditoria</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Relatório técnico de divergência entre o Banco de Dados, Planilha XLSX e Relatório PDF Oficial (Janeiro/2026).
        </p>
      </header>

      <Alert variant="default" className="bg-blue-500/5 border-blue-500/20">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertTitle className="font-bold uppercase tracking-wide text-blue-700">A AUDITORIA DE JANEIRO ESTÁ ENCERRADA</AlertTitle>
        <AlertDescription className="text-sm mt-1 font-medium text-blue-600">
          Diagnóstico concluído: Fontes com versionamentos diferentes — diferença não implica erro automaticamente.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-none shadow-sm bg-muted/30">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Info className="h-4 w-4" />
              Contexto da Conta
            </div>
            <div className="grid gap-4 text-sm">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground font-bold">Conta</Label>
                <p className="font-mono text-foreground select-all">advocacia@leilianepereira.com</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground font-bold">Perfil</Label>
                  <p className="font-semibold">Pessoal / Leiliane</p>
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground font-bold">ID do Perfil</Label>
                  <code className="text-[10px] bg-background px-1 py-0.5 rounded border select-all">c44c244d-b05f-47dc-bc58-7056351e7703</code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-accent/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent-foreground">
              <Database className="h-4 w-4" />
              Problema Principal
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Existem agora <span className="font-bold text-foreground">DUAS FONTES</span> com totais diferentes para o mesmo período.
            </p>
            <div className="grid gap-3 pt-2">
              <div className="flex justify-between items-center text-xs p-2 rounded bg-background border border-border/40">
                <span className="font-medium text-muted-foreground">Fonte PDF</span>
                <div className="text-right">
                  <Badge variant="outline" className="font-mono text-[10px] border-foreground/20">Referência histórica agregada</Badge>
                  <p className="text-[9px] mt-1 text-muted-foreground italic">R$ 202.529,59</p>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs p-2 rounded bg-background border border-border/40">
                <span className="font-medium text-muted-foreground">Fonte XLSX</span>
                <div className="text-right">
                  <Badge variant="outline" className="font-mono text-[10px] border-foreground/20">Versão transacional disponível</Badge>
                  <p className="text-[9px] mt-1 text-muted-foreground italic">R$ 155.195,26</p>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs p-2 rounded bg-background border border-border/40">
                <span className="font-medium text-muted-foreground">Banco</span>
                <div className="text-right">
                  <Badge variant="outline" className="font-mono text-[10px] border-foreground/20">Base operacional atual</Badge>
                  <p className="text-[9px] mt-1 text-muted-foreground italic">Base de Verdade</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator className="opacity-50" />

      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Badge className="bg-foreground text-background font-bold px-3">ETAPA 1</Badge>
          <h2 className="text-xl font-bold tracking-tight">Verificação de Fonte em Todo o Arquivo</h2>
        </div>
        
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-muted-foreground tracking-widest">Diagnóstico de Abas (Jan/2026)</h3>
            <div className="rounded-xl border overflow-hidden bg-background">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase font-bold tracking-tighter">
                  <tr>
                    <th className="px-4 py-3 border-b">Aba do Arquivo</th>
                    <th className="px-4 py-3 border-b text-right">Linhas</th>
                    <th className="px-4 py-3 border-b text-right">Valor Total (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px]">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-foreground">Meu Cofre Corrigido</td>
                    <td className="px-4 py-3 text-right">200</td>
                    <td className="px-4 py-3 text-right font-bold">155.195,26</td>
                  </tr>
                  <tr className="text-muted-foreground/40 italic bg-muted/5">
                    <td className="px-4 py-3">Alterações</td>
                    <td className="px-4 py-3 text-right">18</td>
                    <td className="px-4 py-3 text-right">0,00</td>
                  </tr>
                  <tr className="text-muted-foreground/40 italic bg-muted/5">
                    <td className="px-4 py-3">Revisão necessária</td>
                    <td className="px-4 py-3 text-right">0</td>
                    <td className="px-4 py-3 text-right">0,00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 flex gap-3 items-start">
              <Info className="h-4 w-4 text-yellow-600 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-yellow-800/80 font-medium italic">
                A planilha disponível não é a mesma base que gerou o PDF Oficial. Tentar inventar correspondência entre bases divergentes é proibido por segurança.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-muted-foreground tracking-widest">Rastreio: LEANDRO C TEDROS</h3>
            <p className="text-[10px] text-muted-foreground italic">Busca profunda em todas as colunas de todas as abas por "TEDROS", "TETROS" ou "54000".</p>
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-destructive tracking-widest uppercase">JANEIRO / 2026</span>
                <Badge variant="destructive" className="font-bold uppercase tracking-tighter animate-pulse">NÃO LOCALIZADO</Badge>
              </div>
              <Separator className="bg-destructive/10" />
              <div className="space-y-3">
                <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Ocorrências Confirmadas no XLSX:</p>
                <div className="grid gap-3 text-[10px] font-mono">
                  <div className="flex justify-between items-center p-2 rounded bg-background/50 border border-border/40">
                    <span className="font-medium">04/02/2026 · Linha 625</span>
                    <span className="font-black text-foreground">R$ 54.000,00</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-background/50 border border-border/40">
                    <span className="font-medium">04/03/2026 · Linha 417</span>
                    <span className="font-black text-foreground">R$ 54.000,00</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-background/50 border border-border/40 opacity-50">
                    <span className="font-medium italic">05/04/2026 · Linha 195</span>
                    <span className="font-black">R$ 51.760,09</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="pt-6">
        <Card className="bg-foreground text-background border-none shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardContent className="p-10 text-center space-y-6 relative z-10">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full border-4 border-background flex items-center justify-center">
                <ShieldCheck className="h-10 w-10 text-background" />
              </div>
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tighter">CONCLUSÃO DA AUDITORIA</h2>
            <div className="max-w-xl mx-auto space-y-2">
              <p className="text-sm font-medium opacity-90 leading-relaxed uppercase">
                A planilha XLSX e o PDF Oficial são versionamentos diferentes.
              </p>
              <p className="text-[10px] opacity-60 font-mono">
                Divergências de valor/existência não implicam erro no sistema. 
                O Banco atual é a fonte de verdade para a operação.
              </p>
            </div>
            <div className="pt-4 flex flex-col items-center gap-4">
              <div className="px-6 py-2 rounded-full bg-background text-foreground text-[10px] font-black tracking-widest border border-background/20 shadow-xl uppercase">
                NENHUMA ALTERAÇÃO REALIZADA NO BANCO: SIM
              </div>
              <p className="text-[9px] font-mono opacity-40 uppercase tracking-widest italic">
                LEANDRO C TEDROS: Presente no banco / ausente na versão XLSX de referência.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function XCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`} {...props} />;
}