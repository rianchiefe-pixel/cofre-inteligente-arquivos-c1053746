# Plano de Implementação: Gastos Fixos

Este plano detalha a criação da nova funcionalidade de **Gastos Fixos** no sistema "Meu Cofre", focada no controle de recorrência e identificação inteligente de lançamentos mensais, sem exibição de valores financeiros nesta fase.

## Objetivos
- Monitorar se despesas esperadas (ENEL, Gás, Vivo, Escola, etc.) foram localizadas em todos os meses.
- Implementar um motor de localização inteligente que utilize perfil, imóvel, favorecido e histórico.
- Garantir o isolamento total entre perfis (Pessoal vs. Holding).
- Criar uma matriz visual de acompanhamento mensal (Janeiro a Dezembro).

## Etapas de Implementação

### 1. Estrutura de Dados (Banco de Dados)
- **Tabela `recurring_fixed_expenses`**: Armazena a regra/expectativa de gasto.
    - Campos: `id`, `user_id`, `profile_id`, `name`, `category_id`, `property_id`, `merchant_pattern`, `description_pattern`, `active`, `recurrence`, `start_month`, `end_month`.
- **Tabela `recurring_expense_matches`**: Armazena o vínculo entre a regra e o lançamento real (`receipts`) para cada mês.
    - Campos: `id`, `recurring_fixed_expense_id`, `receipt_id`, `month`, `status` (encontrado, nao_encontrado, revisar, nao_se_aplica).
- **Políticas RLS**: Garantir que cada usuário acesse apenas seus próprios dados.

### 2. Lógica de Localização (Backend/Functions)
- Criar `findRecurringFixedExpenseMatch` (em `src/lib/recurring-expenses.functions.ts`):
    - **Prioridade 1**: Match exato por perfil, imóvel, categoria e favorecido.
    - **Prioridade 2**: Match baseado no histórico de associações confirmadas pelo usuário.
    - **Prioridade 3**: Match aproximado (fuzzy text) em nomes de fornecedores.
    - Retornar status "revisar" em caso de ambiguidade.
- Criar `scanRecurringExpenses` para varrer períodos (ex: Jan-Jun 2026).

### 3. Interface do Usuário (Frontend)
- **Nova Rota**: `src/routes/_authenticated/app.fixed-expenses.tsx`.
- **Navegação**: Adicionar "Gastos Fixos" ao menu lateral (provavelmente em `src/routes/_authenticated/route.tsx` ou componente de layout).
- **Componentes**:
    - Filtros: Perfil, Ano, Imóvel, Categoria, Status.
    - Matriz de Recorrência: Tabela com meses nas colunas e indicadores (✓, !, ○, —).
    - Modal de Detalhes do Mês: Ver lançamento, associar manual, marcar como "não se aplica".
    - Área de Sugestões: Identificar gastos existentes com `expense_behavior = fixed`.

### 4. Segurança e Invariantes
- **Isolamento de Perfil**: O `profile_id` é obrigatório em todas as buscas e caches.
- **Não alteração**: Nenhuma função de Gastos Fixos deve editar valores ou metadados financeiros dos `receipts`.
- **Privacidade**: Valores financeiros (amount) não serão renderizados nesta página.

## Detalhes Técnicos
- Uso de `createServerFn` para a lógica de busca e associação.
- Uso de `useQuery` com `queryKey` dinâmico incluindo `profileId` e `year`.
- Lógica de completude do mês: 100% apenas se todos os gastos estiverem "Encontrado" ou "Não se aplica".

## Verificação e Testes
- Testar especificamente com os casos: ENEL (Casa 25, 26, Sala), Gás e Vivo.
- Verificar o comportamento ao trocar de perfil (Pessoal vs. Holding).
- Validar a varredura inicial de Janeiro a Junho de 2026.
