# Plano de Inclusão Adicional no Relatório

Este plano descreve a implementação da funcionalidade "+ Adicionar ao relatório" na tela de Relatórios, permitindo incluir lançamentos baseados em Destinatários, Imóveis ou Categorias extras que não necessariamente atendem aos filtros principais de seleção (como `property_id`), mantendo a integridade de perfil, período e deduplicação.

## Alterações Sugeridas

### Frontend (Interface)

#### `src/routes/_authenticated/app.reports.tsx`
- Adicionar estado para `extraIncludes` (objeto contendo arrays de `recipients`, `propertyIds` e `categoryIds`).
- Implementar o botão "+ Adicionar ao relatório" abaixo do seletor de Imóveis.
- Criar o menu/modal/popover para seleção do tipo de inclusão.
- Implementar a seleção múltipla de Destinatários (pesquisável com multiselect).
- Adicionar a visualização das inclusões ativas (badges com "x" para remoção) e o botão "Limpar inclusões adicionais".
- Atualizar as queries (`data`, `ledger`, `recipients`) para considerar as inclusões extras.
- Passar `extraIncludes` para a função `loadReportDataset`.

### Backend e Lógica de Dados

#### `src/lib/report-data.ts`
- Atualizar a interface `loadReportDataset` para aceitar `extraIncludes`.
- Modificar a construção da query SQL (Supabase) para implementar a lógica `OR` solicitada:
  ```sql
  WHERE status = 'approved' AND payment_date BETWEEN :from AND :to AND profile_id = :profileId
  AND (
    -- Filtros normais
    (property_id IN (...) OR category_id IN (...) OR recipient_name IN (...))
    OR 
    -- Inclusões extras (OR)
    (property_id IN (:extraPropertyIds) OR category_id IN (:extraCategoryIds) OR recipient_name IN (:extraRecipients))
  )
  ```
- Implementar a deduplicação rigorosa baseada em `receipt.id` no processamento do dataset para garantir que um lançamento que satisfaça múltiplos critérios apareça apenas uma vez.
- Garantir que os totais, agrupamentos e o `propertyBreakdown` (Custo por Imóvel) sejam calculados a partir deste conjunto final deduplicado.

#### `src/lib/report-templates.ts`
- Atualizar os templates de PDF para incluir a seção "Inclusões adicionais" no cabeçalho ou bloco de filtros, listando os itens adicionados manualmente.

## Detalhes Técnicos
- **Deduplicação**: Uso de `Map` ou `Set` by `receipt.id` logo após a busca no Supabase, antes de qualquer cálculo de total.
- **Isolamento de Perfil**: A regra `profile_id = :profileId` será mantida como filtro `AND` global, garantindo que inclusões extras não tragam dados de outros perfis.
- **Estrutura de Dados**:
  ```typescript
  extraIncludes: {
    propertyIds: string[],
    categoryIds: string[],
    recipients: string[]
  }
  ```
- **Filtro de Destinatário**: Utilizar o nome normalizado ou o campo `recipient_name` existente, garantindo consistência com o filtro padrão.

## Verificação e Testes
- **Teste de Deduplicação**: Validar que um lançamento com `property_id` X e `recipient` Y, quando ambos estão selecionados (um no filtro normal e outro no extra), aparece apenas uma vez.
- **Teste de Inclusão `null`**: Confirmar que lançamentos com `property_id = null` entram no relatório se o seu destinatário for adicionado via inclusão extra.
- **Teste de PDF**: Gerar exportações e verificar se o cabeçalho reflete corretamente as inclusões e se os valores batem com a tela.
- **Audit Points**: Responder aos 31 pontos de retorno obrigatórios solicitados pelo usuário.
