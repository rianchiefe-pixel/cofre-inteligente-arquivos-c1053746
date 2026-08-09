import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/cards")({
  head: () => ({
    meta: [{ title: "Cartões — Meu Cofre" }],
  }),
  component: () => <Outlet />,
});
