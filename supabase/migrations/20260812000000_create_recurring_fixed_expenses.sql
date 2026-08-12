CREATE TABLE public.recurring_fixed_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    profile_id UUID NOT NULL,
    property_id UUID,
    category_id UUID,
    name TEXT NOT NULL,
    merchant_pattern TEXT,
    description_pattern TEXT,
    active BOOLEAN DEFAULT true,
    recurrence TEXT DEFAULT 'monthly',
    start_month DATE NOT NULL DEFAULT CURRENT_DATE,
    end_month DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_fixed_expenses TO authenticated;
GRANT ALL ON public.recurring_fixed_expenses TO service_role;

-- RLS
ALTER TABLE public.recurring_fixed_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recurring fixed expenses"
ON public.recurring_fixed_expenses
FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- Tabela para guardar as associações manuais/confirmadas de gastos fixos com receipts reais
CREATE TABLE public.recurring_expense_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_fixed_expense_id UUID REFERENCES public.recurring_fixed_expenses(id) ON DELETE CASCADE NOT NULL,
    receipt_id UUID REFERENCES public.receipts(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- Primeiro dia do mês da recorrência
    status TEXT NOT NULL CHECK (status IN ('encontrado', 'nao_encontrado', 'revisar', 'nao_se_aplica')),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(recurring_fixed_expense_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expense_matches TO authenticated;
GRANT ALL ON public.recurring_expense_matches TO service_role;

ALTER TABLE public.recurring_expense_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recurring expense matches"
ON public.recurring_expense_matches
FOR ALL
TO authenticated
USING (auth.uid() = user_id);
