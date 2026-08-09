import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Sparkles, FolderLock, ScanLine, LayoutDashboard, Building2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meu Cofre — Gestão Inteligente de Comprovantes e Patrimônio" },
      { name: "description", content: "Organize comprovantes, despesas e investimentos com IA. Feito para holdings, empresas e gestores de imóveis. Segurança e precisão patrimonial." },
      { property: "og:title", content: "Meu Cofre — Gestão Inteligente de Comprovantes e Patrimônio" },
      { property: "og:description", content: "Organize comprovantes, despesas e investimentos com IA. Feito para holdings, empresas e gestores de imóveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" }
    ],
  }),
  component: Landing,
});

function Feature({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">Meu Cofre</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost"><Link to="/auth">Entrar</Link></Button>
          <Button asChild variant="premium"><Link to="/auth">Criar conta grátis</Link></Button>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:pt-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent" /> Cofre inteligente com IA
              </span>
              <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
                # Prompt — Reanálise inteligente e correção de categorias duplicadas. Organize <span className="bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">comprovantes, despesas e investimentos</span> com segurança de nível patrimonial.
              </h1>
              <p className="mt-5 max-w-lg text-base text-muted-foreground">
                Feito para pessoas físicas, empresas, holdings familiares e gestores de imóveis.
                Envie comprovantes em lote, deixe a IA ler e classificar, e mantenha tudo separado
                por perfil, banco, conta, cartão e categoria.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="premium"><Link to="/auth">Começar agora</Link></Button>
                <Button asChild size="lg" variant="outline"><Link to="/auth">Já tenho conta</Link></Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Sem cartão de crédito • Armazenamento seguro • LGPD</p>
            </div>
            <div className="relative">
              <div className="absolute -inset-6 rounded-3xl bg-[image:var(--gradient-hero)] opacity-30 blur-3xl" />
              <div className="relative rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Gasto do mês</p>
                    <p className="text-2xl font-bold text-foreground">R$ 18.420,55</p>
                  </div>
                  <span className="rounded-full bg-success/15 px-2 py-1 text-xs font-medium text-success">42 comprovantes</span>
                </div>
                <div className="mt-6 space-y-3">
                  {[
                    { n: "Condomínio Ed. Aurora", c: "Condomínio", v: "R$ 1.240,00" },
                    { n: "Energia — Imóvel SP", c: "Energia", v: "R$ 432,90" },
                    { n: "Aporte Tesouro Direto", c: "Investimentos", v: "R$ 5.000,00" },
                    { n: "Material de construção", c: "Reforma", v: "R$ 2.318,45" },
                  ].map((r) => (
                    <div key={r.n} className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{r.n}</p>
                        <p className="text-xs text-muted-foreground">{r.c}</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{r.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature icon={ScanLine} title="Leitura automática por IA" desc="Envie PDF, JPG ou PNG. A IA extrai data, valor, destinatário, banco e categoria." />
          <Feature icon={FolderLock} title="Cofre organizado" desc="Comprovantes separados por perfil, ano, mês, banco, categoria e imóvel." />
          <Feature icon={ShieldCheck} title="Anti-duplicidade" desc="Comparação por hash, valor, data, destinatário e código de autenticação." />
          <Feature icon={Building2} title="Perfis e holdings" desc="Um cofre por perfil (pessoal, empresa, holding, imóvel) — ou visão consolidada." />
          <Feature icon={LayoutDashboard} title="Dashboard visual" desc="Gastos por banco, por perfil, por categoria e evolução no tempo." />
          <Feature icon={Sparkles} title="Relatórios profissionais" desc="Exportação em PDF, Excel e CSV com filtros avançados." />
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Meu Cofre</p>
          <p>Feito para quem cuida do próprio patrimônio.</p>
        </div>
      </footer>
    </div>
  );
}
