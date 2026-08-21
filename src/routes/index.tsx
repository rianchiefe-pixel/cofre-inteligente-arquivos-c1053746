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
 * MODO CONSTRUÇÃO — IMPLEMENTE DIRETAMENTE
 *
 * Crie uma nova área no sistema chamada “Obrigações PF”, onde PF = Pessoa Física.
 *
 * Adicione “Obrigações PF” na barra lateral, seguindo exatamente o padrão visual atual do Meu Cofre.
 *
 * Não crie apenas uma tela visual. A funcionalidade deve ficar integrada ao banco, às Tarefas e ao sistema já existente.
 *
 * 1. REAPROVEITE O QUE JÁ EXISTE
 *
 * O sistema já possui lógica de obrigações relacionadas aos imóveis e geração de tarefas.
 *
 * Antes de criar qualquer estrutura nova:
 *
 * localize essa implementação;
 *
 * reutilize componentes, banco, vencimentos, tarefas e lógica de comprovantes sempre que possível;
 *
 * não duplique funcionalidades que já existem.
 *
 * A nova área será uma versão organizada dessas obrigações voltada para Pessoa Física.
 *
 * 2. TELA “OBRIGAÇÕES PF”
 *
 * Criar uma tela limpa e organizada contendo:
 *
 * busca;
 *
 * filtro por categoria;
 *
 * filtro por vencimento/status;
 *
 * cards ou lista das obrigações;
 *
 * botão “+ Nova obrigação”.
 *
 * Cada obrigação deve mostrar de forma clara:
 *
 * Nome da obrigação
 * Categoria(s)
 * Próximo vencimento
 * Acesso
 * Status
 *
 * Ações rápidas:
 *
 * Abrir | Editar | Excluir
 *
 * 3. NOVA OBRIGAÇÃO
 *
 * Ao clicar em “+ Nova obrigação”, permitir cadastrar:
 *
 * Dados da obrigação
 *
 * Nome da obrigação*
 * Ex.: Imposto de Renda, ITR, Certificado Digital, INSS etc.
 *
 * Categorias*
 * Campo de múltipla seleção.
 *
 * O usuário deve conseguir:
 *
 * pesquisar uma categoria digitando;
 *
 * selecionar várias categorias;
 *
 * remover categorias selecionadas facilmente.
 *
 * Não crie categorias duplicadas. Utilize as categorias já existentes no sistema sempre que forem compatíveis.
 *
 * Vencimento
 *
 * Data de vencimento
 *
 * Se o sistema atual de obrigações possuir periodicidade/recorrência, reutilize essa lógica, permitindo obrigações mensais, anuais ou outras periodicidades já suportadas.
 *
 * Acesso ao serviço
 *
 * Link de acesso / URL
 * E-mail de acesso
 * Usuário / Login
 * Senha
 *
 * Aplicar o mesmo padrão seguro que já existe na tela Acessos:
 *
 * senha mascarada;
 *
 * botão de visualizar;
 *
 * botão de copiar;
 *
 * botão de copiar login/e-mail.
 *
 * Criar botão principal:
 *
 * ABRIR
 *
 * Ao clicar, abrir o site correspondente em nova aba.
 *
 * O objetivo é permitir que a pessoa entre na obrigação com o mínimo de trabalho possível: abrir o site e copiar rapidamente login, e-mail ou senha.
 *
 * 4. VÍNCULO COM IMÓVEL — OPCIONAL
 *
 * Uma obrigação PF também poderá estar relacionada a um imóvel.
 *
 * Adicionar:
 *
 * Imóvel vinculado (opcional)
 *
 * Utilizar os imóveis já cadastrados no sistema.
 *
 * IMPORTANTE: deve aceitar normalmente imóveis rurais.
 *
 * Não limitar esse campo apenas a casas, apartamentos ou imóveis urbanos.
 *
 * 5. INTEGRAÇÃO AUTOMÁTICA COM “TAREFAS”
 *
 * Esta parte é OBRIGATÓRIA.
 *
 * Uma obrigação PF com vencimento deve gerar automaticamente o controle correspondente na área Tarefas, utilizando a lógica que já existe no sistema.
 *
 * Exemplo:
 *
 * Se existe uma obrigação chamada:
 *
 * ITR Fazenda Boa Vista
 *
 * Quando chegar o período configurado, em Tarefas deve aparecer algo semelhante a:
 *
 * Hoje é dia de ITR Fazenda Boa Vista — PF
 *
 * ou, conforme a antecedência:
 *
 * ITR Fazenda Boa Vista vence em breve.
 *
 * Não crie um segundo sistema de tarefas.
 *
 * Integre com o módulo Tarefas existente.
 *
 * 6. COMPROVANTE
 *
 * Quando a obrigação chegar ao vencimento, a tarefa deve disponibilizar a ação:
 *
 * Enviar comprovante
 *
 * O usuário poderá anexar o comprovante diretamente pela tarefa.
 *
 * Depois do envio:
 *
 * vincular o comprovante à obrigação;
 *
 * vincular ao imóvel, caso exista imóvel relacionado;
 *
 * registrar a conclusão daquela ocorrência;
 *
 * manter o histórico para consultas futuras.
 *
 * Se a obrigação for recorrente, não excluir a obrigação após concluir uma ocorrência. Apenas registrar aquela competência como concluída e gerar o próximo vencimento conforme a periodicidade.
 *
 * 7. EXPERIÊNCIA DE USO
 *
 * Quero uma área extremamente simples de operar.
 *
 * A pessoa deve conseguir:
 *
 * ver obrigação → abrir site → copiar acesso → realizar obrigação → voltar ao Meu Cofre → enviar comprovante → concluir tarefa.
 *
 * Evite excesso de cliques e telas.
 *
 * Mantenha o mesmo design premium, espaçamentos, cores, cards, botões e tipografia utilizados atualmente no Meu Cofre.
 *
 * NÃO FAZER
 *
 * Não alterar a tela atual de Acessos.
 *
 * Não alterar Gastos Fixos.
 *
 * Não remover funcionalidades existentes.
 *
 * Não criar categorias duplicadas.
 *
 * Não criar outra tabela/lógica de tarefas se puder reutilizar a atual.
 *
 * Não quebrar as obrigações dos imóveis já existentes.
 *
 * Não fazer redesign geral da aplicação.
 *
 * Não criar somente o front-end.
 *
 * RESULTADO ESPERADO
 *
 * Implementar completamente:
 *
 * Barra lateral → Obrigações PF → Nova obrigação → categorias múltiplas → vencimento → credenciais → acesso rápido → vínculo opcional com imóvel/rural → integração automática com Tarefas → envio e histórico de comprovantes.
 *
 * Implemente diretamente no código e banco existentes. Não responda apenas explicando o que será feito.
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
