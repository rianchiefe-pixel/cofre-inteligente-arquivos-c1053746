# Plano de Correção: Comportamento de Despesa, Exportação e Normalização

## Problemas Identificados
1. `expense_behavior` ausente do fluxo de edição no Vault.
2. Normalização inconsistente entre PDF, CSV e telas.
3. Bug de data no CSV (deslocamento UTC).
4. Bug de agrupamento no PDF por `categoryId` em categorias genéricas.
5. CSV exportando valores crus ("null") em vez de nomes canônicos.

## Alterações Propostas

### 1. Backend e Esquema
- Atualizar `ConferencePatchSchema` em `src/lib/receipts.functions.ts` para incluir `expense_behavior`.

### 2. Interface do Vault (Cofre)
- Adicionar campos "Natureza" (`transaction_type`) e "Tipo de Gasto" (`expense_behavior`) em `src/components/vault/conference-dialog.tsx`.
- Atualizar `CONFERENCE_FIELDS` em `src/routes/_authenticated/app.vault.tsx`.

### 3. Normalização Canônica
- Criar/Centralizar função de normalização em `src/lib/report-data.ts` seguindo as regras de prioridade: `expense_behavior` > `transaction_type`.
- Aplicar esta função no `loadReportDataset` (PDF) e nas exportações (CSV/XLSX).

### 4. Correção de Exportação (CSV/XLSX)
- Modificar `src/lib/exports.ts` (ou onde a geração do CSV ocorrer) para usar a normalização canônica.
- Corrigir `dateBR` ou criar `formatDateLiteral` para evitar `new Date()` em strings `YYYY-MM-DD` sem horário.

### 5. Agrupamento no PDF
- Ajustar `groupCategories` em `src/lib/report-data.ts` para usar uma chave composta (ou identidade específica) quando a categoria for genérica ("Não identificado", etc.), evitando que itens diferentes sejam somados na mesma linha.

## Testes de Verificação
- **Readback**: Editar um lançamento Fixo para Variável e confirmar persistência via SQL.
- **Isolamento de Datas**: Validar que `2026-01-01` gera `01/01/2026` sem erros de fuso horário.
- **Agrupamento**: Validar que PIX Marketplace e EBAY aparecem separados se forem de categorias genéricas.
- **Consistência de Totais**: Garantir que o COUNT e SUM batem entre SQL, CSV e PDF.

## Detalhes Técnicos
- **Campos Natureza**: `despesa`, `investimento`.
- **Campos Tipo de Gasto**: `fixed`, `variable`, `null`.
- **Mapeamento de Legado**: `gasto_fixo` -> `fixed`, `gasto_variavel` -> `variable` (apenas em memória se DB estiver null).
