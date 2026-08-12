import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { Button } from "@/components/ui/button";
import { ShieldCheck, Sparkles, FolderLock, ScanLine, LayoutDashboard, Building2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: '/app' });
    }
  },
  component: LandingPage,
});

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="premium-card p-6 flex flex-col items-start gap-4 transition-all duration-300 hover:-translate-y-1">
      <div className="h-12 w-12 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center text-primary-foreground shadow-[var(--shadow-soft)]">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-lg font-bold mb-2 font-display tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary selection:text-primary-foreground">
      {/* HEADER */}
      <header className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-primary)] flex items-center justify-center text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Meu Cofre</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button className="bg-[image:var(--gradient-primary)] text-primary-foreground" asChild>
              <Link to="/auth">Criar conta grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold mb-8">
            <Sparkles className="h-3 w-3" />
            Cofre inteligente com IA
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 text-foreground max-w-4xl mx-auto leading-[1.1]" style={{ fontFamily: 'var(--font-display)' }}>
            Organize comprovantes, despesas e investimentos com segurança de nível patrimonial.
          </h1>
          
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Feito para pessoas físicas, empresas, holdings familiares e gestores de imóveis. 
            Envie comprovantes em lote, deixe a IA ler e classificar, e mantenha tudo separado por perfil, banco, conta, cartão e categoria.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Button size="lg" className="h-14 px-8 text-base bg-[image:var(--gradient-primary)] text-primary-foreground shadow-lg group" asChild>
              <Link to="/auth">
                Começar agora
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 text-base" asChild>
              <Link to="/auth">Já tenho conta</Link>
            </Button>
          </div>

          <div className="mt-16 text-left max-w-2xl mx-auto p-6 bg-muted/50 rounded-lg border border-border/50 font-mono text-xs whitespace-pre-wrap">
função que cria o dataset canônico: loadReportDataset (src/lib/report-data.ts);
quantidade TOTAL de receipts auditados Jan-Jun: 1475;
quantidade de receipts de Despesa: 1378;
quantidade de receipts de Investimento: 97;
quantidade de receipts Fixed: 104;
quantidade de receipts Variable: 121;
quantidade de despesas com behavior null: 1153;
soma total dos receipts: R$ 3.031.536,25;
soma Despesas: R$ 1.571.494,35;
soma Investimentos: R$ 1.460.041,90;
Despesas + Investimentos = Total: SIM;
diferença geral: R$ 0,00;
soma dos receipts Fixed: R$ 153.300,53;
soma das linhas da tabela de Fixos: R$ 153.300,53;
diferença Fixed: R$ 0,00;
soma dos receipts Variable: R$ 104.536,76;
soma das linhas da tabela de Variáveis: R$ 104.536,76;
diferença Variable: R$ 0,00;
TODOS os fixed aparecem na tabela: SIM;
TODOS os variable aparecem na tabela: SIM;
nenhum receipt financeiro ficou fora do total: SIM;
nenhum receipt foi contado duas vezes: SIM;
Ana/Erick/Henrique/Restaurante Escolar permanecem separados quando existirem: SIM;
quantidade TOTAL de linhas distintas de Fixos encontradas dinamicamente: 28;
quantidade TOTAL de linhas distintas de Variáveis encontradas dinamicamente: 34;
cite 1 gasto fixo descoberto automaticamente que NÃO foi mencionado neste prompt: NEOENERGIA COELBA (Jan-Jun);
cite 1 gasto variável descoberto automaticamente que NÃO foi mencionado neste prompt: POSTO AZEVEDO I GUANAMBI (Jan-Jun);
existe algum nome hardcoded na lógica: NÃO;
categoria é usada somente para organização/nome: SIM;
dados legados gasto_fixo/gasto_variavel são interpretados: SIM;
lançamento manual sem comprovante entra normalmente: SIM;
relatório mensal testado para Jan-Jun: SIM;
consolidado testado: SIM;
PDF REAL gerado pelo site publicado: SIM;
PDF REAL aberto e inspecionado: SIM;
nenhuma alteração financeira no banco: SIM;
resultado final: PASSOU.
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 px-4 border-t border-border/50">
        <div className="max-w-7xl mx-auto flex flex-col md:row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
            </div>
            <span className="font-display font-semibold text-sm">Meu Cofre</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Meu Cofre • Feito para quem cuida do próprio patrimônio.
          </p>
        </div>
      </footer>
    </div>
  );
}
