# Overhaul do Motor de Matching e UI de Comparação (Análise de Comprovantes)

Este plano detalha o aprimoramento do motor de localização de comprovantes para garantir que recibos existentes sejam encontrados mesmo sem arquivo anexado, a melhoria da UI de comparação para exibir todos os metadados extraídos e a implementação da ação de vínculo.

## Ações Propostas

### 1. Motor de Matching Inteligente (`src/lib/receipt-analysis.functions.ts`)
- **Fase A (SHA-256):** Mantido para arquivos idênticos.
- **Fase B (IDs Fortes):** Expandir para buscar em `auth_code`, `transaction_id`, e novos campos extraídos como PIX EndToEndID ou NSU.
- **Fase C (Busca Estruturada):** Buscar por `amount` e `payment_date` **independentemente** de ter arquivo (`file_path` is null).
- **Fase D (Scoring Ponderado):** Implementar pontuação de similaridade baseada em campos (Valor: 40%, Data: 30%, Nome: 20%, Banco: 10%).
- **Fase E (Fuzzy Matching):** Comparação textual de nomes de destinatários ignorando case/acentos.

### 2. UI de Comparação e Ação de Vínculo
- **Visualizador Decoplado (`src/components/receipt-analysis/analysis-compare-dialog.tsx`):**
    - Exibir "Lançamento sem comprovante anexado" se `candidate.file_path` for nulo.
    - Adicionar seção "Identificadores" (Auth Code, ID Transação) no modal.
    - Exibir Banco e Perfil nos dados extraídos (quando identificados).
- **Ação "Vincular Comprovante":**
    - Implementar `linkReceiptToAnalysisFile` em `src/lib/receipt-analysis.functions.ts`.
    - Esta ação move o arquivo temporário da análise para o caminho definitivo do recibo existente no Cofre e atualiza `file_path`, `file_hash`, e `file_mime`.

### 3. Melhoria no Fluxo de Processamento (`src/lib/receipt-analysis.ts`)
- Garantir que metadados detalhados (CPF, CNPJ, Banco) extraídos via IA/OCR sejam salvos nas colunas estruturadas de `receipt_analysis_files` antes do matching.

## Detalhes Técnicos

- **Deduplicação de Vínculo:** Impedir vinculação se o recibo já possuir um arquivo (a menos que seja sobrescrita solicitada).
- **Storage Migration:** Os arquivos de análise residem em `analysis/`. Ao vincular, o arquivo será copiado/movido para `receipts/` seguindo a estrutura padrão do Cofre.
- **RLS:** Garantir que as políticas permitam o `update` no `receipts` via função autenticada.
