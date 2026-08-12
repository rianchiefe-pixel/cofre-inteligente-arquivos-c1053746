# Plano de Refatoração da Lógica de Relatórios Financeiros

Refatoração profunda da lógica de geração de relatórios para garantir que a classificação financeira (Despesa, Investimento, Fixo, Variável) venha exclusivamente dos dados do lançamento (`receipts`), ignorando configurações de categorias para fins de cálculo.

## Alterações Técnicas

### 1. `src/lib/report-data.ts`
- **Refatorar `resolveReportType`**: Remover dependência de `categoryDefaultType` e `parentDefaultType`. A natureza deve vir apenas de `receipt.transaction_type`.
- **Refatorar `loadReportDataset`**:
  - Garantir que `expenseBehavior` venha apenas de `r.expense_behavior`.
  - Ajustar a agregação de `fixedCents` e `variableCents` para usar estritamente os campos do lançamento.
  - Ajustar `groupCategories` para preservar subcategorias no detalhamento (Educação Ana vs Educação).
  - Garantir que `totalCents` seja `despesaCents + investimentoCents`.

### 2. `src/lib/report-templates.ts`
- **Reformular a Seção de Gastos Fixos**:
  - Criar uma tabela detalhada e compacta para Gastos Fixos.
  - Garantir que subcategorias sejam exibidas individualmente (Educação Ana, Erick, etc.).
  - Implementar validação matemática visual (Soma da tabela == Total da seção).
- **Reformular a Seção de Gastos Variáveis**: Tabela semelhante, mas possivelmente mais resumida, preservando subcategorias.
- **Ajustar Equation**: Exibir `Total = Despesas + Investimentos`.
- **Melhorar Layout PDF**: Garantir que a tabela de fixos não seja truncada (quebra de página).

### 3. `src/lib/report-validation.ts`
- Atualizar validações para refletir que Fixos e Variáveis são subconjuntos de Despesas.
- Adicionar validação de diferença zero entre a soma dos itens da tabela e o total da categoria no dataset.

### 4. `src/routes/_authenticated/app.reports.tsx`
- Sincronizar a lógica de resumo da UI com o novo motor de relatórios.
- Remover alertas de "Sem categoria" que poluem o relatório executivo (mantendo apenas o KPI de pendência na página).

## Critérios de Sucesso
- Relatório gerado a partir de um único dataset canônico.
- Classificação baseada 100% no lançamento.
- Subcategorias detalhadas visíveis e somando corretamente.
- PDF real inspecionado e validado matematicamente.
