# Implementação de Dados de Acesso e Credenciais nas Obrigações PF

Este plano descreve a implementação da área de credenciais (e-mail, usuário, senha) no formulário de Nova Obrigação PF, utilizando a estrutura centralizada e segura do sistema (`property_credentials`).

## Mudanças Técnicas

### Banco de Dados
- A migração para adicionar a coluna `credential_id` em `property_obligations` já foi executada.
- As políticas de RLS e GRANTs devem ser verificadas para garantir que as obrigações pessoais possam acessar as credenciais vinculadas.

### Backend (Server Functions)
- Utilização das funções existentes em `src/lib/credentials.functions.ts`:
  - `savePropertyCredential`: Para criar ou atualizar credenciais com criptografia AES-GCM.
  - `revealPropertyCredential`: Para descriptografar e exibir/copiar senhas de forma segura.

### Frontend (Componentes)
- **Refatoração do Estado do Formulário**: Adição de campos para controle de credenciais:
  - `access_mode`: 'none', 'existing' ou 'new'.
  - `credential_id`: ID da credencial vinculada.
  - `new_cred`: Objeto contendo `email`, `login`, `password`, `website` e `reusable`.
- **Interface do Usuário (`ObligationsPage`)**:
  - Inclusão de seções condicionais no formulário.
  - Seletor de credenciais existentes com busca por serviço, e-mail ou login.
  - Campos de entrada para novas credenciais com botões de copiar e alternar visibilidade da senha.
  - Integração com o sistema de "Acesso Reutilizável" (criação automática na tabela central).
- **Lógica de Salvamento**:
  - Se um novo acesso for preenchido: primeiro salvar a credencial via `savePropertyCredential` e depois vincular o `id` retornado à obrigação.
  - Se um acesso existente for selecionado: vincular o `id` diretamente.
- **Visualização**:
  - Exibição resumida dos dados de acesso nos cards das obrigações PF, com funções de revelar e copiar senha.

## Próximos Passos
1. Importar `useServerFn`, `savePropertyCredential` e `revealPropertyCredential` em `src/components/obligations-pf-manager.tsx`.
2. Atualizar o tipo `PfForm` e o estado inicial.
3. Implementar a lógica de busca de credenciais existentes.
4. Renderizar os novos campos no formulário.
5. Atualizar a `mutationFn` do `save` para lidar com a persistência das credenciais.
6. Adicionar os controles de acesso nos cards da listagem.
