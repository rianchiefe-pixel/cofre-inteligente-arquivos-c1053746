import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck, PlayCircle } from "lucide-react";

const DEMO_EMAIL = "demo@meucofre.com";
const DEMO_PASSWORD = "demo123456";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Meu Cofre" }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo ao Meu Cofre");
    navigate({ to: "/app" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Já pode entrar.");
    navigate({ to: "/app" });
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/app" });
    if (result.error) toast.error("Não foi possível entrar com Google");
  };

  const handleDemo = async () => {
    setLoading(true);
    let { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (error) {
      const signUp = await supabase.auth.signUp({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        options: { emailRedirectTo: `${window.location.origin}/app` },
      });
      if (signUp.error && !/registered/i.test(signUp.error.message)) {
        setLoading(false);
        return toast.error("Não foi possível iniciar o modo teste");
      }
      const retry = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      error = retry.error;
    }
    setLoading(false);
    if (error) return toast.error("Modo teste indisponível. Tente novamente.");
    try {
      sessionStorage.setItem("meucofre:demo", "1");
    } catch {
      /* ignore */
    }
    toast.success("Modo teste ativo — explore o Meu Cofre com dados de demonstração.");
    navigate({ to: "/app" });
  };

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-2">
      <div className="hidden bg-[image:var(--gradient-hero)] p-12 md:flex md:flex-col md:justify-between">
        <Link to="/" className="flex items-center gap-2 text-primary-foreground">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Meu Cofre</span>
        </Link>
        <div className="max-w-md text-primary-foreground">
          <h2 className="text-3xl font-bold leading-tight">Seu patrimônio, organizado com clareza.</h2>
          <p className="mt-4 text-sm text-primary-foreground/80">
            Cofre inteligente de comprovantes com IA, separado por perfil, banco e categoria.
            Perfeito para famílias, empresas, holdings e gestão de imóveis.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} Meu Cofre</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-6 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">Meu Cofre</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground">Acesse seu cofre</h1>
          <p className="mt-1 text-sm text-muted-foreground">Entre com e-mail ou continue com o Google.</p>

          <Button type="button" variant="outline" className="mt-6 w-full" onClick={handleGoogle}>
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
            Continuar com Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button variant="premium" className="w-full" type="submit" disabled={loading}>Entrar</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email2">E-mail</Label>
                  <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Senha</Label>
                  <Input id="password2" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
                </div>
                <Button variant="premium" className="w-full" type="submit" disabled={loading}>Criar conta</Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">← Voltar ao início</Link>
          </p>

          <div className="mt-6 rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4">
            <p className="text-xs font-medium text-foreground">Só quer dar uma olhada?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Entre com uma conta de demonstração e teste dashboard, cofre, imóveis e relatórios sem cadastro.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full border-accent/60 text-foreground hover:bg-accent/10"
              onClick={handleDemo}
              disabled={loading}
            >
              <PlayCircle className="h-4 w-4" /> Entrar em modo teste
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}