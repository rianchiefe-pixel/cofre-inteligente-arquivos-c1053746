# Plano de Aprimoramento do Sistema de Duplicidades

Melhoria completa do fluxo de detecção, comparação e resolução de duplicidades, garantindo que lançamentos sem comprovante físico também sejam comparados e que o usuário tenha ferramentas poderosas de mesclagem e auditoria.

## 1. Núcleo de Detecção e Lógica
- **Nova Tabela `duplicate_checks`**: Criada para armazenar o histórico de auditoria, pontuações de similaridade e campos correspondentes/divergentes.
- **Refatoração do Motor de Duplicidades**: Atualização da `analyzeReceipt` em `src/lib/receipts.functions.ts` para usar pesos mais inteligentes (Pix E2E, Auth Code, NSU com peso alto; Favorecido/Banco com peso médio).
- **Separação Lógica**: O sistema passará a buscar candidatos a duplicidade independente de possuírem arquivo (`file_path`).

## 2. Interface de Comparação (`app.vault.tsx`)
- **Quadro de Comparação Inteligente**: Substituição do aviso "Nenhum comprovante vinculado" pelos dados reais do lançamento existente.
- **Visualização de Diferenças**: Implementação de indicadores visuais (🟢 Igual, 🟡 Semelhante, 🔴 Diferente) para cada campo comparado.
- **Exibição de Motivos**: Nova seção detalhando por que o sistema gerou o alerta (ex: "Mesmo valor", "CPF idêntico").
- **Percentual de Similaridade**: Exibição clara da pontuação calculada.

## 3. Ações e Mesclagem
- **Novo Fluxo de Decisão**: Botões claros para:
  - **Manter como Novo**: Ignora a duplicidade e aprova o lançamento atual.
  - **Mesclar**: Nova funcionalidade para unir o melhor de dois lançamentos (ex: manter a imagem do novo e as classificações do antigo).
  - **Substituir**: Mantém o novo e remove o antigo.
- **Histórico de Decisões**: Persistência do status da análise para evitar alertas repetidos sobre o mesmo par.

## Detalhes Técnicos
- Utilização de `createServerFn` para lógica de mesclagem atômica no servidor.
- Atualização de RLS na nova tabela `duplicate_checks`.
- Garantia de que nenhuma alteração afetará o OCR ou outros fluxos de importação existentes.

---
**Resultado Esperado**: Um sistema onde duplicidades são detectadas por dados bancários e mescladas com precisão, eliminando pontos cegos em lançamentos sem comprovante.
