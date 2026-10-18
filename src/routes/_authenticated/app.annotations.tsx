import { createFileRoute, useRouter } from "@tanstack/react-router";
import { annotationsQuery } from "@/lib/annotations.functions";
import { AnnotationsManager } from "@/components/annotations-manager";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/annotations")({
  validateSearch: (search) => ({
    q: typeof search.q === "string" ? search.q : "",
    property: typeof search.property === "string" ? search.property : "all",
    type: typeof search.type === "string" ? search.type : "all",
    from: typeof search.from === "string" ? search.from : "",
    until: typeof search.until === "string" ? search.until : "",
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(annotationsQuery),
  head: () => ({ meta: [
    { title: "Anotações — Meu Cofre" },
    { name: "description", content: "Suas anotações, informações e arquivos privados no Meu Cofre." },
    { property: "og:title", content: "Anotações — Meu Cofre" },
    { property: "og:description", content: "Suas anotações e arquivos privados, organizados em um só lugar." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AnnotationsPage,
  pendingComponent: () => <p className="py-8 text-muted-foreground">Carregando anotações…</p>,
  errorComponent: AnnotationsError,
  notFoundComponent: () => <p>Anotações não encontradas.</p>,
});
function AnnotationsPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return <AnnotationsManager filters={filters} onFilters={(next) => { void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true }); }} />;
}
function AnnotationsError() {
  const router = useRouter();
  return <div role="alert" className="space-y-4"><h1 className="text-3xl font-bold">Anotações</h1><p>Não foi possível carregar suas anotações.</p><Button onClick={() => router.invalidate()}>Tentar novamente</Button></div>;
}