# Plano de Implementação: Gestão Centralizada de Acessos

Criar uma nova área "Acessos" na barra lateral para gerenciar credenciais de imóveis de forma global, permitindo filtros por imóvel e sincronização bidirecional.

## Alterações de Banco de Dados (Database)

As tabelas `property_credentials` e `property_credential_links` já existem. Não são necessárias migrações estruturais, mas garantiremos que as RLS policies permitam a leitura global baseada no `user_id` do usuário autenticado.

## Componentes e Frontend

### 1. Novo Componente: `AccessesManager`
*   **Arquivo**: `src/components/accesses-manager.tsx`
*   **Função**: Centralizar a lógica de listagem, busca, filtro e edição de acessos.
*   **Reuso**: Utilizará a lógica de criptografia de `src/lib/credentials.functions.ts` e o visual de cartões de `src/components/property-tabs.tsx`.
*   **Novidade**: Adicionar campo "Imóveis Vinculados" no formulário de criação/edição, permitindo multi-seleção.

### 2. Nova Rota: `/app/accesses`
*   **Arquivo**: `src/routes/_authenticated/app.accesses.tsx`
*   **Conteúdo**: Renderizará o `AccessesManager`.

### 3. Atualização da Barra Lateral (Sidebar)
*   **Arquivo**: `src/components/app-shell.tsx`
*   **Ação**: Adicionar o item "Acessos" à lista `nav`.

## Detalhes Técnicos

*   **Sincronização**: O sistema usará a tabela `property_credentials` como fonte da verdade. O campo `property_id` da tabela será considerado o "imóvel principal" (origem), e a tabela `property_credential_links` gerenciará os vínculos adicionais.
*   **Filtros**:
    *   Busca textual (serviço, login, notas).
    *   Filtro por Imóvel (via junção com `property_credential_links`).
    *   Filtro por Tipo de Acesso (Extraído do campo `service` ou novos metadados se disponíveis).
*   **Segurança**: Manter o uso de `revealPropertyCredential` para exibir senhas, garantindo que o `CREDENTIALS_ENC_KEY` nunca saia do servidor.

## Passos de Execução

1.  Criar `src/routes/_authenticated/app.accesses.tsx`.
2.  Criar `src/components/accesses-manager.tsx` (reutilizando e adaptando o `CredentialsTab` de `property-tabs.tsx`).
3.  Atualizar `src/components/app-shell.tsx` para incluir o link no menu.
4.  Validar a sincronização: criar um acesso na tela global e verificar se ele aparece na aba do imóvel vinculado.
