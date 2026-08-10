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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold mb-8 animate-rise">
            <Sparkles className="h-3 w-3" />
            Cofre inteligente com IA
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 animate-rise text-foreground max-w-4xl mx-auto leading-[1.1]" style={{ fontFamily: 'var(--font-display)' }}>
            Organize comprovantes, despesas e investimentos com segurança de nível patrimonial.
          </h1>
          
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto animate-rise [animation-delay:200ms]">
            Feito para pessoas físicas, empresas, holdings familiares e gestores de imóveis. 
            Envie comprovantes em lote, deixe a IA ler e classificar, e mantenha tudo separado por perfil, banco, conta, cartão e categoria.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 animate-rise [animation-delay:400ms]">
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

          <p className="text-xs text-muted-foreground animate-rise [animation-delay:600ms]">
            Sem cartão de crédito • Armazenamento seguro • LGPD
          </p>
        </div>
      </section>

      {/* DEMO CARD SECTION */}
      <section className="py-10 px-4">
        <div className="max-w-4xl mx-auto animate-rise [animation-delay:800ms]">
          <div className="premium-card p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success">
                <LayoutDashboard className="h-5 w-5" />
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Gasto do mês</p>
                <h2 className="text-4xl font-bold mb-4 font-display">R$ 18.420,55</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex -space-x-2">
                    {[1,2,3].map(i => <div key={i} className="h-6 w-6 rounded-full border-2 border-background bg-accent" />)}
                  </div>
                  <span>42 comprovantes este mês</span>
                </div>
              </div>
              
              <div className="space-y-3">
                {[
                  { label: "Condomínio Ed. Aurora", value: "R$ 1.250,00", type: "Fixo" },
                  { label: "Energia — Imóvel SP", value: "R$ 480,20", type: "Variável" },
                  { label: "Aporte Tesouro Direto", value: "R$ 5.000,00", type: "Investimento" },
                  { label: "Material de construção", value: "R$ 2.150,00", type: "Variável" }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="font-bold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="py-24 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard 
              icon={ScanLine}
              title="Leitura automática por IA"
              description="Envie PDF, JPG ou PNG. A IA extrai data, valor, destinatário, banco e categoria automaticamente."
            />
            <FeatureCard 
              icon={FolderLock}
              title="Cofre organizado"
              description="Comprovantes separados por perfil, ano, mês, banco, categoria e imóvel de forma estruturada."
            />
            <FeatureCard 
              icon={ShieldCheck}
              title="Anti-duplicidade"
              description="Comparação inteligente por hash, valor, data, destinatário e código de autenticação."
            />
            <FeatureCard 
              icon={Building2}
              title="Perfis e holdings"
              description="Um cofre por perfil (pessoal, empresa, holding, imóvel) ou visão consolidada do patrimônio."
            />
            <FeatureCard 
              icon={LayoutDashboard}
              title="Dashboard visual"
              description="Gastos por banco, por perfil, por categoria e evolução no tempo com gráficos interativos."
            />
            <FeatureCard 
              icon={Sparkles}
              title="Relatórios profissionais"
              description="Exportação em PDF, Excel e CSV com filtros avançados para contabilidade e gestão."
            />
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
