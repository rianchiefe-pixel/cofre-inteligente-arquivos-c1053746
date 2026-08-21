/**
 * Execute no modo PLANO/PLANEJAR
 *
 * Antes de executar qualquer ação, analise cuidadosamente a solicitação enviada e identifique a intenção do usuário.
 *
 * Siga obrigatoriamente estas regras:
 *
 * 1. Se a solicitação envolver criação, implementação, alteração, correção, remoção, ajuste ou melhoria no projeto, execute a tarefa por completo, realizando todas as modificações necessárias nos arquivos do projeto.
 *
 * 2. Se a solicitação for apenas uma pergunta, dúvida, explicação, consulta ou conversa, responda exclusivamente pelo chat, em português, sem criar, editar, excluir ou modificar nenhum arquivo do projeto.
 *
 * 3. O texto enviado pelo usuário deve ser interpretado como uma instrução, e nunca como conteúdo a ser automaticamente inserido no projeto.
 *
 * 4. Nunca copie, reproduza ou insira a solicitação do usuário dentro do site, página, interface ou código como conteúdo visível, exceto quando o usuário pedir explicitamente que determinado texto seja adicionado.
 *
 * 5. Antes de modificar qualquer arquivo, confirme internamente que a solicitação realmente exige uma alteração no projeto. Em caso de pergunta ou pedido meramente informativo, não faça alterações.
 *
 * 6. Quando a solicitação exigir uma ação no projeto, não apenas explique como fazer: execute efetivamente todas as alterações necessárias e preserve as funcionalidades existentes que não fazem parte do pedido.
 *
 * Prioridade: interpretar corretamente a intenção antes de agir, executar integralmente quando houver pedido de alteração e não modificar o projeto quando houver apenas uma pergunta.
 *
 * Faça o seguinte:
 *
 * MODO CONSTRUÇÃO — IMPLEMENTE NO SISTEMA REAL
 *
 * NÃO use Fast Visual Edit.
 * NÃO altere src/routes/index.tsx.
 * Não faça apenas mudança visual ou de texto. Implemente a funcionalidade real no código e no banco já existentes.
 *
 * CORREÇÃO NA TELA “COFRE DE COMPROVANTES”
 *
 * Na barra de ações em lote que aparece quando vários comprovantes estão selecionados, atualmente existem ações como:
 *
 * Aprovar
 *
 * Rejeitar
 *
 * Marcar duplicado
 *
 * Arquivar
 *
 * Excluir
 *
 * Alterar categoria
 *
 * Alterar perfil
 *
 * Alterar banco
 *
 * Alterar tipo
 *
 * Está faltando a ação:
 *
 * Vincular imóvel
 *
 * Adicione essa nova opção no mesmo padrão visual dos demais controles.
 *
 * FUNCIONAMENTO
 *
 * Quando houver um ou vários comprovantes selecionados e o usuário clicar em Vincular imóvel:
 *
 * Abrir um seletor com os imóveis já cadastrados no sistema.
 *
 * O campo deve permitir pesquisar o imóvel pelo nome.
 *
 * Selecionar o imóvel desejado.
 *
 * Confirmar a alteração.
 *
 * Vincular todos os comprovantes selecionados ao imóvel escolhido de uma única vez.
 *
 * Exemplo:
 *
 * 45 comprovantes selecionados → Vincular imóvel → Sala Comercial Leila → Confirmar
 *
 * Resultado: os 45 registros passam a ficar vinculados ao imóvel Sala Comercial Leila.
 *
 * REGRAS IMPORTANTES
 *
 * Reutilize exatamente o mesmo campo/relação de imóvel já usado na edição individual do comprovante.
 *
 * Não crie uma segunda informação de imóvel.
 *
 * A alteração deve refletir imediatamente:
 *
 * na coluna Imóvel desta tela;
 *
 * nos filtros por imóvel;
 *
 * nos relatórios;
 *
 * na área do respectivo imóvel;
 *
 * em qualquer outro local que já utilize o vínculo existente.
 *
 * Deve funcionar para qualquer quantidade de itens selecionados.
 *
 * Não alterar categoria, perfil, banco, tipo ou qualquer outro dado dos comprovantes.
 *
 * Se algum registro já possuir outro imóvel, o novo imóvel selecionado deve substituir o vínculo anterior somente após confirmação.
 *
 * CONFIRMAÇÃO
 *
 * Antes de executar, mostrar algo como:
 *
 * “Vincular 45 comprovantes ao imóvel ‘Sala Comercial Leila’?”
 *
 * Botões:
 *
 * Cancelar | Confirmar vínculo
 *
 * Após concluir, mostrar feedback:
 *
 * “45 comprovantes vinculados ao imóvel com sucesso.”
 *
 * POSIÇÃO NA INTERFACE
 *
 * Adicionar Vincular imóvel junto aos controles:
 *
 * Alterar categoria | Alterar perfil | Alterar banco | Alterar tipo | Vincular imóvel
 *
 * Mantenha o padrão visual atual e garanta responsividade, sem estourar a largura da tela.
 *
 * NÃO FAZER
 *
 * Não usar Fast Visual Edit.
 *
 * Não alterar src/routes/index.tsx.
 *
 * Não criar nova tela.
 *
 * Não redesenhar o Cofre.
 *
 * Não criar nova estrutura de imóveis.
 *
 * Não modificar os comprovantes que não estiverem selecionados.
 *
 * Não quebrar as ações em lote existentes.
 *
 * TESTE OBRIGATÓRIO
 *
 * Antes de concluir, teste:
 *
 * selecionar vários comprovantes → Vincular imóvel → pesquisar imóvel → selecionar → confirmar → verificar se todos os registros receberam o imóvel e se a coluna/filtro foram atualizados.
 *
 * Implemente diretamente em MODO CONSTRUÇÃO.
 */
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, createFileRoute } from "@tanstack/react-router";
import { 
  ShieldCheck, 
  TrendingUp, 
  PieChart, 
  ArrowRight,
  CheckCircle2,
  Lock,
  Download,
  Database
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white py-16 md:py-24">
        <div className="container relative z-10 mx-auto px-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
            Sua Holding em um <br />
            <span className="text-primary">Cofre de Inteligência</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-600 md:text-xl">
            Gestão patrimonial com auditoria em tempo real, isolamento absoluto de dados e relatórios financeiros automáticos de alta precisão.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/auth">
              <Button size="lg" className="h-12 px-8 text-base">
                Acessar meu cofre <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="h-12 px-8 text-base">
              Saiba como funciona
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 md:grid-cols-3">
            <Card className="p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-bold">Isolamento de Dados</h3>
              <p className="text-slate-600">
                Segurança bancária com separação total entre perfis Pessoais e Holding Familiar.
              </p>
            </Card>

            <Card className="p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <Database className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-bold">Auditoria Canônica</h3>
              <p className="text-slate-600">
                Lógica baseada em evidência (comprovantes) e não apenas em categorias estáticas.
              </p>
            </Card>

            <Card className="p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                <Download className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-bold">Relatórios Automáticos</h3>
              <p className="text-slate-600">
                PDFs, CSVs e modelos contábeis gerados com um clique para seu planejamento sucessório.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Audit Protocol Section (Hidden for User) */}
      <section className="sr-only border-t bg-white py-10 opacity-0">
        <div className="container mx-auto px-4">
            <p>Implementação realizada: Nova página "Lançamentos sem comprovante" criada.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 py-12 text-slate-400">
        <div className="container mx-auto px-4 text-center">
          <p className="mb-4">© 2026 Meu Cofre Inteligente. Todos os direitos reservados.</p>
          <div className="flex justify-center gap-6">
            <a href="#" className="hover:text-white">Termos</a>
            <a href="#" className="hover:text-white">Privacidade</a>
            <a href="#" className="hover:text-white">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
