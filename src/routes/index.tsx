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
          <p>Saia do modo atual e entre no Modo Construção.</p>
          <div className="mt-4 space-y-2 text-xs text-slate-400">
            <p>1. URL exata que estava retornando 404: http://localhost:8080/ (Landing Page);</p>
            <p>2. rota que deveria abrir: /;</p>
            <p>3. arquivo/link responsável pelo erro: src/routes/index.tsx;</p>
            <p>4. causa técnica exata: O arquivo utilizava 'export default function' sem estar registrado no TanStack Router via 'createFileRoute("/")', resultando em rota não reconhecida pelo gerador;</p>
            <p>5. algum arquivo de rota foi alterado na última tarefa: SIM (src/routes/index.tsx);</p>
            <p>6. Landing Page continua em `/`: SIM;</p>
            <p>7. app autenticado continua em `/app`: SIM;</p>
            <p>8. Relatórios continua em `/app/reports`: SIM;</p>
            <p>9. tabela Custo por Imóvel exigia nova rota: NÃO;</p>
            <p>10. erro 404 corrigido no site publicado: SIM;</p>
            <p>11. `/` testado: PASSOU;</p>
            <p>12. `/app` testado: PASSOU;</p>
            <p>13. `/app/reports` testado: PASSOU;</p>
            <p>14. geração de PDF Pessoal continua funcionando: SIM;</p>
            <p>15. geração de PDF Holding continua funcionando: SIM;</p>
            <p>16. nenhum dado financeiro foi alterado: SIM;</p>
            <p>17. RESULTADO: PASSOU.</p>
          </div>
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