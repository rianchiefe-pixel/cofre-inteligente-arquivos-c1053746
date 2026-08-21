import { createFileRoute } from "@tanstack/react-router";
import { ObligationsPage } from "@/components/obligations-pf-manager";

export const Route = createFileRoute("/_authenticated/app/personal-obligations")({
  head: () => ({ meta: [{ title: "Obrigações PF — Meu Cofre" }] }),
  component: ObligationsPage,
});