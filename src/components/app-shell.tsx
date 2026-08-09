import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Landmark,
  CreditCard,
  Upload,
  FolderLock,
  Tags,
  FileBarChart,
  LogOut,
  Menu,
  X,
  Home,
  ShieldAlert,
  ListTodo,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRoles, hasPermission, highestRole, ROLE_LABEL, type Permission } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { seedDemoData, resetDemoData } from "@/lib/demo.functions";
import { isDemoEmail } from "@/lib/demo";
import { ProfileSelector } from "@/components/profile-selector";

const nav: { to: string; label: string; icon: typeof LayoutDashboard; perm?: Permission }[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/profiles", label: "Perfis", icon: Users, perm: "manageEntities" },
  { to: "/app/properties", label: "Imóveis", icon: Home, perm: "manageEntities" },
  { to: "/app/tasks", label: "Tarefas", icon: ListTodo },
  { to: "/app/banks", label: "Bancos e contas", icon: Landmark, perm: "manageEntities" },
  { to: "/app/cards", label: "Cartões", icon: CreditCard, perm: "manageEntities" },
  { to: "/app/upload", label: "Enviar comprovantes", icon: Upload, perm: "uploadReceipts" },
  { to: "/app/import", label: "Importação Inteligente", icon: Upload, perm: "importData" },
  { to: "/app/vault", label: "Cofre", icon: FolderLock },
  { to: "/app/categories", label: "Categorias", icon: Tags, perm: "manageEntities" },
  { to: "/app/holding-advocacia", label: "Advocacia (Holding)", icon: Scale, perm: "editReceipts" },
  { to: "/app/reports", label: "Relatórios", icon: FileBarChart },
  { to: "/app/audit", label: "Auditoria", icon: ShieldAlert, perm: "viewAudit" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string>("");
  const [open, setOpen] = useState(false);
  const { data: roles } = useRoles();
  const top = highestRole(roles);
  const visibleNav = nav.filter((item) => !item.perm || hasPermission(roles, item.perm));
  const isDemo = isDemoEmail(email);
  const [resetting, setResetting] = useState(false);

  const resetDemo = async () => {
    if (!confirm("Isso restaurará os dados fictícios da conta demo. Deseja continuar?")) return;
    setResetting(true);
    try {
      const result = await seedDemoData({ data: { reset: true } });
      if (!result.ok || !result.seeded) throw new Error("O servidor não confirmou o seed.");
      await queryClient.invalidateQueries();
      toast.success(
        result.filesFailed > 0
          ? `Dados demo restaurados, mas ${result.filesFailed} arquivo(s) não foram removidos do armazenamento.`
          : "Dados demo restaurados.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao restaurar dados demo");
    } finally {
      setResetting(false);
    }
  };
  
  const wipeDemo = async () => {
    if (!confirm("Isso apagará TODOS os dados da conta demo (zerado). Deseja continuar?")) return;
    setResetting(true);
    try {
      const result = await resetDemoData();
      if (!result.ok) throw new Error("O servidor não confirmou a limpeza.");
      await queryClient.invalidateQueries();
      toast.success(
        result.filesFailed > 0
          ? `Dados apagados, mas ${result.filesFailed} arquivo(s) permaneceram no armazenamento.`
          : "Todos os dados demo foram apagados.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao apagar dados demo");
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Você saiu do cofre");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 glass px-4 py-3 md:hidden">
        <Link to="/app" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="font-display font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Meu Cofre</span>
        </Link>
        <div className="flex items-center gap-2">
          {isDemo && <Badge variant="outline" className="border-accent/60 text-[10px]">Modo teste</Badge>}
          <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${open ? "block" : "hidden"} md:block fixed inset-x-0 top-[57px] z-20 border-b border-sidebar-border bg-sidebar md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r md:border-sidebar-border/60`}
          style={{ backgroundImage: "linear-gradient(180deg, var(--sidebar) 0%, color-mix(in oklab, var(--sidebar) 92%, black) 100%)" }}
        >
          <div className="hidden items-center gap-3 border-b border-sidebar-border/60 px-6 py-5 md:flex">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[image:var(--gradient-gold)] text-accent-foreground shadow-[var(--shadow-gold)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-sidebar-foreground" style={{ fontFamily: "var(--font-display)" }}>Meu Cofre</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/50">Cofre Inteligente</p>
            </div>
          </div>
          {isDemo && (
            <div className="mx-3 mt-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] font-medium text-accent-foreground animate-rise">
              Conta demo ativa
              <div className="mt-2 flex flex-col gap-2">
                <button
                  onClick={resetDemo}
                  disabled={resetting}
                  className="w-full rounded-md border border-accent/40 bg-background/60 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-background disabled:opacity-60"
                >
                  {resetting ? "..." : "Restaurar semente"}
                </button>
                <button
                  onClick={wipeDemo}
                  disabled={resetting}
                  className="w-full rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-60"
                >
                  {resetting ? "..." : "Zerar tudo (Limpar)"}
                </button>
              </div>
            </div>
          )}
          <div className="px-3 py-4 border-b border-sidebar-border/40 mb-2">
            <ProfileSelector />
          </div>
          <nav className="space-y-0.5 p-3">
            {visibleNav.map(({ to, label, icon: Icon }) => {
              const active = pathname === to || (to !== "/app" && pathname.startsWith(to));
              return (
                <Link
                  key={to}
                  to={to}
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-300 ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--sidebar-primary)_35%,transparent)]"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-[image:var(--gradient-gold)]" />
                  )}
                  <Icon className={`h-4 w-4 transition-colors ${active ? "text-accent" : "text-sidebar-foreground/60 group-hover:text-accent"}`} />
                  <span className="font-medium">{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-sidebar-border/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-xs text-sidebar-foreground/55">{email}</span>
              {top && <Badge variant="secondary" className="shrink-0 text-[10px]">{ROLE_LABEL[top]}</Badge>}
            </div>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div key={pathname} className="mx-auto max-w-7xl px-4 py-6 md:px-10 md:py-12 animate-rise">{children}</div>
        </main>
      </div>
    </div>
  );
}