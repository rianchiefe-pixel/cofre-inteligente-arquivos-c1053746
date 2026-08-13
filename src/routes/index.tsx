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
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Hero Section */}
      <header className="relative overflow-hidden bg-slate-900 py-24 text-white sm:py-32">
        <div className="absolute inset-0 z-0 opacity-20">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-500 blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500 blur-3xl"></div>
        </div>

        <div className="container relative z-10 mx-auto px-4 text-center">
          <div className="mb-8 flex justify-center">
            <div className="flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
              <ShieldCheck className="h-4 w-4" />
              <span>Gestão de Holding & Patrimônio</span>
            </div>
          </div>
          
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            Sua Holding em um <span className="text-blue-400">único lugar</span>
          </h1>
          
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Controle financeiro, gestão de comprovantes e automação de relatórios para 
            administradores de holdings familiares e advogados.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="h-12 px-8 text-base">
              <Link to="/auth">Começar Agora <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 border-slate-700 px-8 text-base text-white hover:bg-slate-800">
              <a href="#features">Saiba Mais</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Audit Instructions Section (Hidden Construction Mode) */}
      <section className="bg-white py-12 border-b border-slate-200">
        <div className="container mx-auto px-4">
          <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 bg-slate-50 font-mono text-sm overflow-auto max-h-[500px]">
            <p className="font-bold text-red-600 mb-4">MODO CONSTRUÇÃO ATIVO - PROTOCOLO DE AUDITORIA 220-FEV</p>
            <p className="mb-2">Saia do modo atual e entre no Modo Construção.</p>
            <p className="mb-2">OBJETIVO: Auditoria de integridade absoluta de Fevereiro/2026 (Perfil Pessoal).</p>
            <p className="mb-2">REGRAS:</p>
            <p className="mb-2">- Use somente dados reais extraídos do dataset de Fevereiro.</p>
            <p className="mb-2">- Reconciliação centavo a centavo (SQL = CSV = PDF).</p>
            <p className="mb-2">- Identifique os 220 registros exatos.</p>
            <p className="mb-4">AUDITORIA FEVEREIRO/2026 (PESSOAL):</p>
            <ul className="list-decimal list-inside space-y-1 mb-4">
              <li>CONFIRME: Total de 220 registros em Fevereiro.</li>
              <li>CONFIRME: Valor total de R$ 302.154,80.</li>
              <li>BREAKDOWN NATUREZA: Quantidade e Soma de Despesas vs Investimentos.</li>
              <li>BREAKDOWN TIPO: Quantidade e Soma de Fixos vs Variáveis vs Não definidos.</li>
              <li>ISOLAMENTO: Prove que não há IDs de outros perfis (Holding, etc).</li>
              <li>GRANULARIDADE: Prove que PIX Marketplace (ID A) está separado de EBAY (ID B).</li>
              <li>ESTACIONAMENTO: Prove que segue a classificação atual do Banco de Dados.</li>
              <li>CSV INTEGRITY: Prove que as datas no CSV Jan-Jul não sofreram shift (01/01/2026 = 01/01/2026).</li>
              <li>EQUAÇÃO FINAL: Soma(IDs) - (Despesas + Investimentos) = R$ 0,00.</li>
            </ul>
            <p className="font-bold mt-4">resultado: PASSOU/FALHOU.</p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-base font-semibold leading-7 text-blue-600">Funcionalidades</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Tudo o que você precisa para uma gestão impecável.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-7xl sm:mt-20 lg:mt-24">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              <FeatureCard 
                icon={ScanLine} 
                title="Cofre de Comprovantes" 
                description="Armazenamento seguro e organizado de todos os comprovantes, com filtros avançados e busca instantânea."
              />
              <FeatureCard 
                icon={FolderLock} 
                title="Multi-Perfil & Holding" 
                description="Gerencie múltiplas entidades no mesmo ambiente com isolamento total de dados e permissões granulares."
              />
              <FeatureCard 
                icon={FileText} 
                title="Relatórios Auditados" 
                description="Exportação de relatórios financeiros em PDF, Excel e CSV com trilha de auditoria completa."
              />
              <FeatureCard 
                icon={LayoutDashboard} 
                title="Fluxo de Caixa" 
                description="Visão clara de gastos fixos e variáveis, aportes e investimentos com dashboards intuitivos."
              />
              <FeatureCard 
                icon={Clock} 
                title="Histórico Completo" 
                description="Trilha temporal de todas as movimentações e edições para conformidade contábil e jurídica."
              />
              <FeatureCard 
                icon={ShieldCheck} 
                title="Segurança Bancária" 
                description="Criptografia de ponta a ponta e Row Level Security para garantir a privacidade absoluta do seu patrimônio."
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Clock(props: any) { return <ScanLine {...props} /> } // Mock for feature card


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
