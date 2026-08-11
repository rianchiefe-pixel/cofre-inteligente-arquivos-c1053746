# Importação de Faturas de Cartão de Crédito

Escopo grande — implementarei em uma única entrega, mas por módulos claros para revisão.

## 1. Cadastro completo dos cartões (`app.cards.tsx`)

Adicionar ao formulário existente:
- Instituição financeira (já tem via `bank_id`)
- **Limite** (novo campo `credit_limit`)
- Titular principal (já tem via `holder`)
- **Cartões adicionais** — lista dinâmica com `holder_name` + `last4` (nova tabela `card_holders`)

Nova tela de detalhe `/app/cards/$id` com:
- Dados do cartão + adicionais
- Botão **"Importar fatura"** (upload PDF/imagem/planilha)
- Lista de faturas importadas (histórico)
- Lançamentos por titular

## 2. Modelo de dados (migration)

```sql
-- Adicionais/complementares do cartão
CREATE TABLE card_holders (
  id, card_id → cards, user_id,
  holder_name text, last4 text, is_primary bool
);

-- Cartão: novo campo
ALTER TABLE cards ADD COLUMN credit_limit numeric;

-- Faturas importadas (agrupa todos os lançamentos de um upload)
CREATE TABLE card_statements (
  id, card_id, user_id,
  period_start date, period_end date,
  closing_date date, due_date date,
  total_amount numeric, minimum_payment numeric,
  source_file_path text, source_hash text UNIQUE,
  status text, -- 'processing' | 'review' | 'approved' | 'archived'
  raw_analysis jsonb
);

-- Lançamentos individuais da fatura
CREATE TABLE card_transactions (
  id, statement_id, card_id, card_holder_id, user_id,
  txn_date date, description text, amount numeric, currency text,
  country text, installment_current int, installment_total int,
  last4 text, category text, kind text, -- 'compra'|'tarifa'|'juros'|'estorno'|'pagamento'|'saque'|...
  property_id, profile_id, confidence numeric,
  status text, -- 'pending'|'approved'|'rejected'|'later'|'duplicate'
  original_series_id uuid, -- para vincular parcelas futuras à mesma compra
  raw jsonb
);
```

Todas com RLS `auth.uid() = user_id` + GRANTs padrão.

## 3. Motor de análise IA (`src/lib/card-statement.functions.ts`)

Server function `analyzeStatement(fileId, cardId)`:
1. Extrai texto **100% das páginas** (pdfjs) + OCR fallback quando texto < 20 chars/página.
2. Envia texto completo (paginado, em chunks se necessário) para `openai/gpt-5.5` com prompt rigoroso pedindo:
   - Metadados (banco, período, fechamento, vencimento, total, mínimo, titulares e finais)
   - Array de lançamentos por seção/cartão com todos os campos (data, descrição, valor, moeda, país, parcela X/Y, last4, holder, kind, category)
   - Marca `low_confidence: true` para linhas ilegíveis (não descarta)
3. Persiste em `card_statements` + `card_transactions` com `status='pending'`.
4. Detecta duplicidade por (card_id, txn_date, amount, description, installment_current) e marca `status='duplicate'`.
5. Auto-associa `card_holder_id` por `last4` ou nome; se `last4` novo, sinaliza para "Adicionar este cartão".
6. Para parcelas: gera `original_series_id` deterministicamente (hash de descrição+valor da parcela+card) para não recriar parcelas em novas importações.

Prompt reforça: **não multiplicar valor por total de parcelas**, **não tratar pagamento como despesa**, **listar linha por linha sem pular**.

## 4. Progresso real (`ImportStatementPanel`)

Barra com etapas: enviando → lendo páginas (X/Y) → identificando cartões → analisando lançamentos → checando parcelas → duplicidades → pronto para conferência.

## 5. Modal de conferência (`StatementReviewDialog`)

Layout moderno reutilizando padrão do `import-conference.tsx`:
- **Header**: banco, período, total, contadores (aprovados/pendentes/negados/dup/baixa confiança)
- **Abas por titular/cartão** (Adroalves 4582 · Vina 7731 · Maria 2190)
- **Tabela** com colunas: data, descrição, valor, parcela X/Y, kind, categoria, imóvel, confiança, status
- Ações em lote: Aprovar tudo · Negar tudo · Marcar todos "Verificar depois"
- Ações por linha: aprovar · negar · verificar depois · editar (data/descrição/valor/categoria/cartão/imóvel) · marcar como (pessoal/despesa/investimento/reembolso/estorno) · excluir
- Botão **"Adicionar transação não localizada"** → modal de inclusão manual
- **Resumo final** antes de confirmar: quantidades por status, duplicidades, baixa confiança, total aprovado
- Aprovados viram registros no sistema (respeitando: pagamentos não geram despesa duplicada, parcelas ficam ligadas por `original_series_id`)

## 6. Aprendizado / histórico

Reutiliza `import_preferences` existente: chave `card_merchant:<descrição normalizada>` → sugere `property_id`/categoria em importações futuras.

## Arquivos criados/tocados

- **Migration**: `card_holders`, `card_statements`, `card_transactions`, `cards.credit_limit`
- `src/lib/card-statement.functions.ts` (analyze, approve, reject, later, addManual, dedupe)
- `src/lib/card-statement-ai.ts` (prompt + parser da IA)
- `src/routes/_authenticated/app.cards.tsx` (limite + adicionais no form)
- `src/routes/_authenticated/app.cards.$id.tsx` (nova página de detalhe + upload + histórico)
- `src/components/card-import-panel.tsx` (upload + progresso)
- `src/components/card-statement-review.tsx` (modal de conferência)
- `src/components/app-shell.tsx` (nada — Cartões já existe)

## Fora do escopo

- Reprocessamento de importações já feitas via módulo genérico "Importação Inteligente" — este novo fluxo é dedicado ao cartão.
- OCR de faturas com senha (pediremos a senha em iteração futura).

Confirma para eu começar?
