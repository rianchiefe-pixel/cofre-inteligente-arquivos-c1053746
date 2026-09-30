# Previsibilidade: detalhar, editar e excluir lançamentos com segurança

## O que foi encontrado
- 14 previsões manuais são, na verdade, compras parceladas no cartão (forma "crédito parcelado" + cartão vinculado). Hoje entram como "Previsões manuais", não como "Cartão de Crédito".
- 27 obrigações recorrentes (todas mensais). Não existe exceção por mês: dá para editar/excluir só a série inteira.
- A lista de detalhes existe, mas é somente leitura (sem Editar/Excluir).

## O que o usuário vai ver
1. **Totais clicáveis**: Gastos Fixos, Variáveis, Cartão de Crédito, Obrigações, Manuais e o total do mês abrem a lista de lançamentos daquele mês que formam o valor (soma sempre igual ao card).
2. **Cada item com menu** "Editar" e "Excluir / Parar recorrência".
3. **Editar**: descrição, valor, banco/conta, cartão, categoria, fixo/variável, data/vencimento, forma de pagamento, recorrência e observações. Em lançamentos recorrentes, pergunta: "Somente setembro de 2026", "Setembro de 2026 e próximos meses", "Toda a recorrência", "Cancelar".
4. **Excluir**: nunca apaga direto. Pergunta: "Somente setembro de 2026", "Este mês e próximos", "Encerrar recorrência", "Cancelar". "Somente este mês" vira exceção: os outros meses continuam.
5. **Recorrência**: mensal, a cada 2, 3 ou 6 meses, anual (e diária/semanal/quinzenal, que já existem). Uma despesa trimestral só aparece a cada 3 meses.
6. **Parcelas do cartão** aparecem em "Cartão de Crédito" como "Notebook — Parcela 2/6", e não entram mais em "Manuais".
7. Tudo se atualiza na hora (cards, gráficos, saldo) sem sair da página.

## Quais lançamentos podem ser editados
- Obrigações (imóveis e PF) e previsões manuais: edição completa, com escopo.
- Gastos fixos cadastrados e lançamentos futuros do Cofre: edição do registro original.
- Parcelas vindas de faturas importadas e estimativas pelo histórico: só "Excluir somente este mês" (exceção) e link para o registro original, para não alterar dados importados do banco.

## Detalhes técnicos
**Banco (sem apagar nada, idempotente):**
- Nova tabela `forecast_overrides` (exceções por ocorrência): `source_type`, `source_id`, `occurrence_date`, `action` (`skip` | `override`), campos opcionais `amount`, `description`, `category_id`, `account_id`, `card_id`, `bank_id`, `kind`, `payment_method`, `date`. Única por (usuário, origem, ocorrência). RLS por dono, GRANTs.
- `financial_forecasts`: nova coluna `origin` (`manual` | `credit_card` | `bank`), padrão `manual`. Migração marca como `credit_card` apenas os registros com cartão e forma crédito (os 14), sem alterar valor, parcelas, datas, IDs. Antes, cópia de segurança em `financial_forecasts_backup_<data>`.
- `property_obligations` e `financial_forecasts`: colunas opcionais `account_id`/`bank_id` onde faltarem, para troca de banco sem duplicar.
- Cada edição/exclusão grava em `audit_logs` (valor antigo e novo).

**Escopos:**
- Só este mês → grava exceção (`override`/`skip`).
- Este mês e próximos → encerra a série original na ocorrência anterior (`end_date`) e cria a continuação a partir deste mês com os novos dados (sem sobreposição, logo sem duplicar); em exclusão, só define `end_date`.
- Toda a recorrência → atualiza o registro original; em exclusão, status `cancelado`/`cancelled` (histórico preservado).

**Motor (`forecast-engine.ts`):** aplica exceções após gerar ocorrências; previsões manuais com `origin = credit_card` saem como `credit_card_installment` com "Parcela x/y" contada a partir da data inicial; deduplicação entre parcela manual e parcela de fatura importada (mesmo cartão + descrição + valor + parcela); totais derivados só da lista final de itens.

**Tela (`app.forecast.tsx`):** menu por item no Drilldown, diálogo de edição, diálogo de escopo, mutações que invalidam a consulta da Previsibilidade.

**Testes** (novos no arquivo de testes do motor): fixo mensal, variável, troca fixo↔variável, troca de banco, valor só no mês, valor mês+próximos, exclusão só no mês, encerramento, trimestral, semestral, parcelado no cartão, parcialmente pago, manual→cartão, sem duplicidade, totais, virada dezembro→janeiro.

Ao final: resumo técnico com causas, arquivos, mudanças no banco, migração, regras e testes.
