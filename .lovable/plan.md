# Plano de Aprimoramento da Gestão de Imóveis - Meu Cofre

Transformação da área de Imóveis em uma central administrativa completa com isolamento por perfil, compartilhamento de credenciais e integração de tarefas.

## Mudanças no Banco de Dados

### Novas Tabelas e Estruturas
- **`property_credential_links`**: Tabela de relacionamento N:N entre `property_credentials` e `properties`.
  - Campos: `id`, `credential_id`, `property_id`, `created_at`.
  - Permite que um único acesso (Neoenergia, IPTU, etc.) seja visualizado por múltiplos imóveis.
- **Extensão de `property_obligations`**:
  - Adição de campos para metadados específicos: `installation_number`, `consumer_unit`, `registration_number`, `client_number`, `contract_number`, `real_estate_tax_id` (inscrição imobiliária).
  - Adição de `credential_id` para vincular a obrigação ao acesso correspondente.

### Migrações SQL
- Criação da tabela de vínculo com RLS e políticas baseadas em `auth.uid()`.
- Criação de funções RPC para gerenciar vínculos (adicionar/remover imóveis de uma credencial).
- Migração de dados existentes de `property_credentials.property_id` para a nova tabela de vínculos.

## Alterações na Interface (Frontend)

### Nova Navegação Interna (`src/routes/_authenticated/app.properties.$id.tsx`)
- Substituição das abas atuais por uma estrutura mais completa:
  - **Visão Geral**: Dashboard resumido com próximos vencimentos e tarefas pendentes.
  - **Contas e Obrigações**: Lista detalhada de taxas e tributos.
  - **Acessos**: Central de credenciais (cards com ações rápidas).
  - **Tarefas e Lembretes**: Integração com o sistema global de tarefas.
  - **Documentos**: Gestão de anexos vinculados.
  - **Despesas**: Lançamentos financeiros filtrados por este imóvel.

### Componentes de Formulário (`src/components/property-tabs.tsx`)
- **Novo Formulário de Obrigações**:
  - Seleção de tipo com campos condicionais (ex: Inscrição Imobiliária só para IPTU).
  - Configuração de recorrência flexível (Mensal, Anual, Parcelada, etc.).
  - Toggle para criar lembrete automático na área global de tarefas.
- **Novo Formulário de Acessos**:
  - Interface para seleção múltipla de imóveis ("Este acesso é utilizado em outros imóveis?").
  - Busca de imóveis filtrada estritamente pelo perfil atual.
  - Ações rápidas de "Copiar" e "Abrir Site" com feedback visual.

## Integração de Lógica e Segurança

### Sistema de Lembretes
- Ao salvar uma obrigação com lembrete, disparar a criação/atualização de uma `property_tasks` vinculada.
- Garantir que a conclusão da tarefa em um imóvel não afete a do outro no caso de lembretes compartilhados.

### Blindagem de Perfis
- Garantir que a lista de imóveis para compartilhamento respeite `profile_id`.

## Detalhes Técnicos
- Utilização de `createServerFn` para operações de criptografia e auditoria de senhas.
- Invalidação de cache via `react-query`.
- Responsividade: Layout adaptativo para cards de acessos em dispositivos móveis.
