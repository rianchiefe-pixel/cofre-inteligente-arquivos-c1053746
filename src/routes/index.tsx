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
            ENTRE NO MODO CONSTRUÇÃO.

NÃO ALTERE BANCO.

NÃO ALTERE RECEIPTS.

NÃO FAÇA NOVA MIGRAÇÃO.

NÃO MEXA EM PROFILE_ID.

A IMAGEM PROVA QUE O PROBLEMA AGORA ESTÁ NO VALIDADOR DO RELATÓRIO.

Na própria tela:

TOTAL correto do perfil Pessoal:

R$ 4.498.224,98

Porém o alerta vermelho compara:

R$ 4.848.973,39

vs

R$ 4.498.224,98

Portanto:

O dataset principal do relatório JÁ ESTÁ CORRETO.

Quem está errado é a função que produz a mensagem:

“Total de Janeiro/2026 diverge da soma dos grupos...”

==================================================

1. LOCALIZE A STRING EXATA DO ERRO

==================================================

Faça busca GLOBAL no código por esta frase EXATA:

"diverge da soma dos grupos"

e também por:

"Total geral do período diverge"

"soma dos grupos"

NÃO procure genericamente.

Quero descobrir EXATAMENTE:

- arquivo;

- função;

- linha/bloco;

- quem chama essa função;

- qual dataset ela recebe.

==================================================

2. NÃO USE O TOTAL ANTIGO

==================================================

O alerta está usando estes valores incorretos:

Jan R$ 253.028,87

Fev R$ 846.845,45

Mar R$ 452.003,62

Abr R$ 2.450.037,40

Mai R$ 391.501,83

Jun R$ 343.199,11

Jul R$ 112.357,11

Total:

R$ 4.848.973,39

Enquanto os grupos corretos são:

Jan R$ 227.844,13

Fev R$ 799.038,10

Mar R$ 400.710,72

Abr R$ 2.394.717,69

Mai R$ 314.011,21

Jun R$ 268.868,12

Jul R$ 93.035,01

Total:

R$ 4.498.224,98

DESCUBRA de onde vêm os primeiros números.

Não os corrija manualmente.

==================================================

3. TRACE AS DUAS FONTES DA COMPARAÇÃO

==================================================

Na função de validação, identifique separadamente:

A) de onde vem o valor chamado “Total do mês”

B) de onde vem a “soma dos grupos”

Quero os nomes REAIS das variáveis.

Exemplo conceitual:

monthlyTotal = ????

groupsTotal = ????

Descubra exatamente qual consulta/array alimenta cada uma.

O problema é que A está usando um dataset diferente de B.

==================================================

4. O VALIDADOR DEVE USAR O MESMO DATASET CANÔNICO

==================================================

A validação NÃO pode executar uma segunda soma independente sobre:

- receipts globais;

- ledger bruto;

- todos os perfis;

- status diferentes;

- dataset legado;

- lançamentos de cartão duplicados;

- registros fora do filtro;

- query antiga.

O relatório já possui o dataset canônico filtrado por:

profileId

período

status

demais filtros ativos

A validação deve partir EXATAMENTE desse mesmo dataset.

Uma única fonte da verdade.

==================================================

5. DESCUBRA OS R$ 350.748,41 EXCEDENTES

==================================================

A diferença atual é:

R$ 4.848.973,39

-

R$ 4.498.224,98

=

R$ 350.748,41

Liste os registros que existem no dataset usado pelo “Total” do alerta, mas NÃO existem no dataset canônico do relatório.

Faça comparação por receipt_id.

Quero:

extraIds =

idsDoTotalErrado

-

idsDoDatasetCanonico

Para esses registros informar:

- receipt_id

- data

- amount

- profile_id

- status

- origem/tipo

- motivo pelo qual entrou no cálculo errado

A soma dos extraIds deve explicar os R$ 350.748,41.

==================================================

6. ATENÇÃO: O ERRO ANTIGO MUDOU

==================================================

Não reutilize a explicação anterior sem conferir.

Agora o alerta mostra:

Maio:

R$ 391.501,83 vs R$ 314.011,21

Junho:

R$ 343.199,11 vs R$ 268.868,12

Julho:

R$ 112.357,11 vs R$ 93.035,01

Portanto o validador atual está incluindo mais registros do que a auditoria anterior.

É obrigatório descobrir QUAIS.

==================================================

7. ALERTA DUPLICADO

==================================================

Na imagem existem DOIS alertas vermelhos praticamente idênticos.

Investigue por que a mesma validação está sendo disparada duas vezes.

Verifique:

- dois useEffect;

- função chamada em dois componentes;

- relatório mensal + outro relatório executando validação simultaneamente;

- StrictMode não tratado;

- toast disparado durante render;

- query onSuccess + useEffect;

- duas instâncias do componente.

A mensagem deve aparecer NO MÁXIMO uma vez se houver erro.

==================================================

8. REGRA MATEMÁTICA DO VALIDADOR

==================================================

Para cada mês:

canonicalTotal =

despesa + investimento

Fixo e variável são subconjuntos de despesa e NÃO entram novamente na soma principal.

O validador deve comparar valores derivados do MESMO conjunto de receipts.

Não deve existir:

rawTotal de uma query

versus

groupTotal de outra query.

==================================================

9. IMPORTANTE

==================================================

NÃO simplesmente remova o alerta.

Ele é útil para detectar inconsistências.

CORRIJA A FONTE DO VALIDADOR.

Quando os dados estiverem coerentes, naturalmente não haverá erro para exibir.

==================================================

10. TESTE OBRIGATÓRIO

==================================================

Com:

Perfil = Pessoal

01/01/2026 a 31/07/2026

o resultado esperado é:

Jan:

total = grupos = R$ 227.844,13

Fev:

total = grupos = R$ 799.038,10

Mar:

total = grupos = R$ 400.710,72

Abr:

total = grupos = R$ 2.394.717,69

Mai:

total = grupos = R$ 314.011,21

Jun:

total = grupos = R$ 268.868,12

Jul:

total = grupos = R$ 93.035,01

GERAL:

total = grupos = R$ 4.498.224,98

Diferença em todos:

R$ 0,00

A tela deve carregar SEM ALERTA VERMELHO.

==================================================

RESPONDA SOMENTE

==================================================

1. arquivo e função que geravam “diverge da soma dos grupos”;

2. variável/fonte usada no total errado;

3. variável/fonte usada na soma correta;

4. por que os datasets eram diferentes;

5. quantidade de registros extras no cálculo errado;

6. soma dos registros extras;

7. os extras explicam R$ 350.748,41: SIM/NÃO;

8. causa dos alertas duplicados;

9. validador passou a usar o dataset canônico único: SIM/NÃO;

10. nenhuma alteração no banco: SIM/NÃO;

11. Jan diferença = R$ 0,00: SIM/NÃO;

12. Fev diferença = R$ 0,00: SIM/NÃO;

13. Mar diferença = R$ 0,00: SIM/NÃO;

14. Abr diferença = R$ 0,00: SIM/NÃO;

15. Mai diferença = R$ 0,00: SIM/NÃO;

16. Jun diferença = R$ 0,00: SIM/NÃO;

17. Jul diferença = R$ 0,00: SIM/NÃO;

18. Geral diferença = R$ 0,00: SIM/NÃO;

19. alerta vermelho desapareceu da tela real: SIM/NÃO;

20. resultado: PASSOU/FALHOU.
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
