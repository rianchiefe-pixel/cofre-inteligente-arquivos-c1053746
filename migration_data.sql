-- Migrar gasto_fixo
UPDATE public.receipts 
SET transaction_type = 'despesa', expense_behavior = 'fixed' 
WHERE transaction_type::text = 'gasto_fixo';

-- Migrar gasto_variavel
UPDATE public.receipts 
SET transaction_type = 'despesa', expense_behavior = 'variable' 
WHERE transaction_type::text = 'gasto_variavel';

-- Herdar da categoria para NULL ou outros tipos legados (pessoal, empresarial, patrimonial)
UPDATE public.receipts r
SET 
    transaction_type = c.default_type,
    expense_behavior = COALESCE(r.expense_behavior, c.expense_behavior)
FROM public.categories c
WHERE r.category_id = c.id 
  AND (r.transaction_type IS NULL OR r.transaction_type::text NOT IN ('despesa', 'investimento'))
  AND c.default_type IS NOT NULL
  AND c.default_type::text IN ('despesa', 'investimento');
