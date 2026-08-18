# Plano de Ajuste do Relatório Financeiro (PDF e Cabeçalho)

Este plano descreve as correções visuais no Relatório Financeiro geral, focando na largura da tabela detalhada (para caber em A4 Paisagem) e na exibição discreta dos filtros aplicados.

## Alterações Propostas

### 1. Correção da Tabela Detalhada no PDF
- **Arquivo:** `src/lib/exports.ts`
- **Ação:** Ajustar a função `exportPDF` para garantir que a tabela detalhada final caiba integralmente na largura da página A4 Paisagem.
- **Detalhes Técnicos:**
    - Manter `orientation: "landscape"` e `format: "a4"`.
    - Configurar `tableLayout: "fixed"` nas opções do `autoTable`.
    - Definir larguras proporcionais estritas (Soma = 100%):
        - Data: 6%, Valor: 7%, Destinatário: 14%, Banco: 9%, Perfil: 5%, Imóvel: 12%, Categoria: 9%, Natureza: 7%, Tipo de Gasto: 7%, Método: 6%, Autenticação: 10%, Observações: 8%.
    - Reduzir fonte para 7pt (corpo) e 7.5pt (cabeçalho).
    - Reduzir padding para `cellPadding: 3`.
    - Implementar quebra de texto inteligente (`overflow: "linebreak"` e `overflow-wrap: "anywhere"` para autenticação).
    - Garantir que o cabeçalho se repita em cada página (`showHead: "everyPage"`).
    - Evitar quebras de linha no meio de transações (`rowPageBreak: "avoid"`).

### 2. Identificação de Filtros no Cabeçalho do PDF
- **Arquivo:** `src/lib/exports.ts` (Interface) e `src/routes/_authenticated/app.reports.tsx` (Preenchimento) e `src/lib/report-templates.ts` (Modelos fixos/mensais).
- **Ação:** Exibir os imóveis selecionados e os adicionais incluídos no cabeçalho do PDF de forma discreta.
- **Detalhes Técnicos:**
    - Adicionar propriedades `selectedPropertyNames` e `extraIncludeNames` ao `ReportPayload`.
    - No `exportPDF`, renderizar essas linhas logo abaixo do subtítulo/título com fontes pequenas (8-9px para imóveis, 6.5pt cinza para adicionais).
    - Diferenciar claramente entre "Imóveis selecionados:" e "Adicionais:".

### 3. Sincronização entre Telas
- **Arquivo:** `src/routes/_authenticated/app.reports.tsx`
- **Ação:** Garantir que ao clicar em "Exportar", os nomes amigáveis dos imóveis e adicionais sejam passados para o gerador de PDF.

## Critérios de Aceite
- Todas as 12 colunas da tabela detalhada visíveis dentro da largura da folha.
- Tabela detalhada em modo paisagem.
- Cabeçalho exibindo filtros de forma discreta.
- Nenhum ajuste em cálculos ou outros modelos de relatório.
- Coluna "Observações" terminando antes da margem direita.
