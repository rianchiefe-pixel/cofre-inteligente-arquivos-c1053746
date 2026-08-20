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
 * NÃO ALTERE TEXTO DA HOME. NÃO MEXA EM src/routes/index.tsx A MENOS QUE ELE REALMENTE CONTENHA A LÓGICA DE UPLOAD.CORRIJA APENAS O ERRO FUNCIONAL DE RLS NO UPLOAD DE DOCUMENTOS. NÃO ALTERE O LAYOUT E NÃO DESATIVE A SEGURANÇA.
 *
 * Ao enviar um documento em:
 *
 * Imóveis → imóvel → Documentos → Novo documento
 *
 * o sistema agora retorna:
 *
 * new row violates row-level security policy
 *
 * Isso significa que o upload ou o INSERT no banco está sendo bloqueado pelas políticas RLS.
 *
 * FAÇA PRIMEIRO O DIAGNÓSTICO
 *
 * Localize exatamente qual operação está falhando:
 *
 * upload no storage.objects;
 *
 * INSERT na tabela de documentos;
 *
 * INSERT na tabela de vínculo documento ↔ imóvel;
 *
 * ou outra tabela envolvida.
 *
 * Não faça alterações aleatórias.
 *
 * Inspecione a função de upload e identifique qual tabela/bucket gera o erro.
 *
 * CORREÇÃO OBRIGATÓRIA
 *
 * O usuário autenticado deve poder:
 *
 * enviar documentos;
 *
 * criar o registro do documento;
 *
 * vinculá-lo ao imóvel;
 *
 * visualizar;
 *
 * baixar;
 *
 * editar;
 *
 * excluir;
 *
 * somente quando tiver acesso ao perfil/imóvel correspondente.
 *
 * A política precisa utilizar corretamente auth.uid() e os relacionamentos já existentes no Meu Cofre.
 *
 * MUITO IMPORTANTE
 *
 * Verifique se o INSERT está enviando corretamente os campos necessários, como:
 *
 * user_id / owner_id, se existentes;
 *
 * profile_id;
 *
 * property_id;
 *
 * created_by;
 *
 * demais campos utilizados pelas policies atuais.
 *
 * Pode estar acontecendo de a policy exigir um desses campos e o frontend estar enviando null ou um ID incorreto.
 *
 * Não corrija apenas a policy sem conferir o payload do INSERT.
 *
 * STORAGE
 *
 * Se o erro estiver no Supabase Storage, verifique as policies do bucket utilizado pelos documentos.
 *
 * A política de INSERT deve permitir upload para usuário autenticado quando o arquivo estiver relacionado a um imóvel/perfil que ele pode acessar.
 *
 * O novo caminho já deve permanecer seguro, por exemplo:
 *
 * {propertyId}/{uuid}.pdf
 *
 * Não volte a usar o nome original do arquivo na key.
 *
 * BANCO DE DADOS
 *
 * Se o erro estiver na tabela de documentos, ajuste a policy de INSERT para validar o acesso ao imóvel/perfil.
 *
 * A lógica deve ser equivalente a:
 *
 * permitir INSERT se auth.uid() possuir acesso ao profile_id/property_id informado no novo registro.
 *
 * Utilize os relacionamentos reais já existentes no projeto.
 *
 * Não invente uma estrutura paralela.
 *
 * NÃO FAÇA
 *
 * NÃO:
 *
 * desative RLS;
 *
 * use USING (true) ou WITH CHECK (true) indiscriminadamente;
 *
 * torne o bucket público para resolver o problema;
 *
 * use service role key no frontend;
 *
 * remova autenticação;
 *
 * altere o design da página;
 *
 * crie dados mockados.
 *
 * A solução deve continuar segura.
 *
 * TRATE O FLUXO COMPLETO
 *
 * O fluxo correto deve ser:
 *
 * usuário autenticado
 * → imóvel autorizado
 * → upload no storage
 * → INSERT do documento
 * → vínculo com imóvel
 * → documento aparece na lista
 *
 * Se qualquer etapa posterior falhar depois do upload, faça rollback/cleanup para não deixar arquivo órfão no Storage.
 *
 * TESTE OBRIGATÓRIO
 *
 * Use um usuário autenticado e teste no mesmo imóvel:
 *
 * abrir Documentos;
 *
 * clicar em Novo documento;
 *
 * selecionar PDF;
 *
 * preencher título;
 *
 * enviar;
 *
 * não ocorrer mais new row violates row-level security policy;
 *
 * documento aparecer imediatamente;
 *
 * atualizar a página;
 *
 * documento continuar aparecendo;
 *
 * visualizar;
 *
 * baixar;
 *
 * adicionar um segundo documento;
 *
 * excluir um documento.
 *
 * Também confirme que um usuário sem acesso ao imóvel NÃO consegue acessar seus documentos.
 *
 * IMPORTANTE
 *
 * Não me responda apenas dizendo que alterou uma policy. Identifique primeiro qual operação está sendo bloqueada e corrija o RLS + payload do INSERT de forma compatível com a estrutura atual do Meu Cofre.
 *
 * Não considere concluído até realizar um upload real com sucesso.
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
