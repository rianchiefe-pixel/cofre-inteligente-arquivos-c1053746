-- Adiciona coluna expense_behavior na tabela categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS expense_behavior TEXT CHECK (expense_behavior IN ('fixed', 'variable'));

-- Adiciona coluna expense_behavior na tabela receipts
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS expense_behavior TEXT CHECK (expense_behavior IN ('fixed', 'variable'));

-- Comentários para documentar o modelo de dois eixos
COMMENT ON COLUMN public.categories.default_type IS 'Natureza da categoria: despesa ou investimento';
COMMENT ON COLUMN public.categories.expense_behavior IS 'Comportamento do gasto: fixed (fixo) ou variable (variável)';
COMMENT ON COLUMN public.receipts.transaction_type IS 'Natureza do lançamento: despesa, investimento, etc';
COMMENT ON COLUMN public.receipts.expense_behavior IS 'Comportamento do gasto: fixed (fixo) ou variable (variável)';
