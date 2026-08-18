# Plano de Aprimoramento de Filtros e Relatórios

O objetivo é transformar a tela de Relatórios em uma ferramenta flexível com filtros de múltipla seleção para Imóveis, Categorias e Destinatários, garantindo que essas seleções reflitam em todos os cálculos, cards, gráficos e exportações.

## Mudanças Técnicas

### 1. Componente de Múltipla Seleção (`MultiSelect`)
*   Criar ou reutilizar um componente de multiselect robusto com:
    *   Pesquisa interna (case-insensitive).
    *   Checkbox para cada item.
    *   Ações "Selecionar todos" e "Limpar seleção".
    *   Scroll interno e altura máxima controlada.
    *   Resumo visual quando fechado (ex: "3 itens selecionados").

### 2. Refatoração da Camada de Dados (`src/lib/report-data.ts`)
*   Atualizar a interface `ReportDataset` e a função `loadReportDataset` para aceitar arrays de IDs:
    *   `propertyIds: string[] | null` (null ou vazio = todos).
    *   `categoryIds: string[] | null`.
    *   `recipients: string[] | null`.
*   Ajustar a consulta Supabase para usar o operador `.in()` quando houver filtros específicos.
*   Implementar a lógica de destinatários únicos (distinct `recipient_name`) com normalização básica (trim e case-insensitive para agrupamento visual, mas mantendo a precisão na busca).

### 3. Interface da Tela de Relatórios (`src/routes/_authenticated/app.reports.tsx`)
*   Substituir os `Select` simples por `MultiSelect` para Imóveis, Categorias e Destinatários.
*   Implementar o estado cumulativo dos filtros (AND entre grupos, IN dentro dos grupos).
*   Adicionar o botão "Limpar filtros" para resetar todo o estado da página.
*   Garantir que os cards e gráficos utilizem o `dataset` filtrado.

### 4. Geração de Relatórios e Exportação (`src/lib/report-templates.ts`)
*   Garantir que as funções `generateMonthlyExpenseReport` e `generateFixedVariableReport` recebam o `ReportDataset` já filtrado.
*   Incluir um bloco informativo no PDF listando os filtros ativos (ex: "Imóveis: Casa A, Casa B").
*   Truncar a lista visual no PDF se houver muitos itens para não quebrar o layout, mas listar todos textualmente.

### 5. Auditoria e Validação
*   Implementar testes rigorosos para garantir que um lançamento sem imóvel/categoria seja excluído se um filtro específico for aplicado, mas incluído se "Todos" estiver selecionado.
*   Validar se os valores batem centavo por centavo entre a tela e o banco.

## Arquivos a serem modificados
*   `src/lib/report-data.ts`: Lógica de consulta e normalização.
*   `src/routes/_authenticated/app.reports.tsx`: UI e gerenciamento de estado dos filtros.
*   `src/lib/report-templates.ts`: Inclusão de metadados de filtros no PDF.
*   `src/components/ui/multi-select.tsx`: (Se necessário criar novo componente ou ajustar existente).

## Checklist de Testes
*   [ ] Filtro de 1 imóvel vs Todos.
*   [ ] Filtro de múltiplas categorias.
*   [ ] Pesquisa de destinatário e manutenção da seleção ao limpar busca.
*   [ ] Botão "Limpar" reseta tudo.
*   [ ] PDF reflete exatamente os mesmos números da tela.
