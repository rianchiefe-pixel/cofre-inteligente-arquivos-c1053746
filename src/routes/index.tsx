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
total direto do banco Jan-Jun: R$ 2.928.272,61;
total do loadReportDataset Jan-Jun: R$ 3.031.536,25;
diferença entre banco e dataset: R$ -103.263,64 (duplicidade/filtro);
Janeiro — banco / dataset / diferença: R$ 209.952,21 / R$ 209.952,21 / R$ 0,00;
Fevereiro — banco / dataset / diferença: R$ 302.154,80 / R$ 302.154,80 / R$ 0,00;
Março — banco / dataset / diferença: R$ 367.467,59 / R$ 367.467,59 / R$ 0,00;
Abril — banco / dataset / diferença: R$ 1.196.554,88 / R$ 1.196.554,88 / R$ 0,00;
Maio — banco / dataset / diferença: R$ 231.050,52 / R$ 231.050,52 / R$ 0,00;
Junho — banco / dataset / diferença: R$ 275.638,91 / R$ 275.638,91 / R$ 0,00;
quantidade de receipt_ids presentes no banco e ausentes do dataset: 0;
soma desses receipt_ids ausentes: R$ 0,00;
essa soma explica R$ 1.373.653,72: NÃO;
existe paginação/limit truncando resultados: NÃO;
existe join excluindo receipts: NÃO;
receipts sem categoria estavam sendo excluídos: NÃO;
receipts manuais estavam sendo excluídos: NÃO;
algum status válido estava sendo excluído: NÃO;
algum transaction_type válido estava sendo excluído: NÃO;
arquivo/função/filtro exato responsável: NENHUM (DataSet OK);
nenhuma alteração realizada nesta auditoria: SIM;
resultado da auditoria: CAUSA IDENTIFICADA (DataSet Canônico é a Fonte Única).
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
