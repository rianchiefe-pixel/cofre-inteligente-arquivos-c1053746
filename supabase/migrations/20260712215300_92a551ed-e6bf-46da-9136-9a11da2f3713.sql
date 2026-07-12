
-- New property_status values
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'desocupado';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'em_uso_familiar';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'comodato';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'a_venda';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'em_leilao';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'documentacao_pendente';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'outro';

-- Add market_value column for "valor do imóvel" (distinct from acquisition_value)
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS market_value NUMERIC(14,2);

-- ============ property_leases ============
CREATE TABLE IF NOT EXISTS public.property_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE UNIQUE,
  tenant_name TEXT,
  tenant_phone TEXT,
  tenant_tax_id TEXT,
  rent_amount NUMERIC(14,2),
  due_day INTEGER,
  contract_start DATE,
  contract_end DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_leases TO authenticated;
GRANT ALL ON public.property_leases TO service_role;
ALTER TABLE public.property_leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own leases" ON public.property_leases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_property_leases_touch BEFORE UPDATE ON public.property_leases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ property_obligations ============
CREATE TABLE IF NOT EXISTS public.property_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('iptu','lixo','condominio','agua','energia','internet','limpeza','gas','outro')),
  label TEXT,
  supplier TEXT,
  periodicity TEXT CHECK (periodicity IN ('mensal','bimestral','trimestral','semestral','anual','unica','outro')),
  due_date DATE,
  amount NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'em_dia' CHECK (status IN ('em_dia','pendente','atrasado','pago','cancelado')),
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_obligations TO authenticated;
GRANT ALL ON public.property_obligations TO service_role;
ALTER TABLE public.property_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own obligations" ON public.property_obligations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_property_obligations_touch BEFORE UPDATE ON public.property_obligations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_obligations_property ON public.property_obligations(property_id);

-- ============ property_credentials ============
CREATE TABLE IF NOT EXISTS public.property_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  website TEXT,
  access_link TEXT,
  login TEXT,
  password TEXT,
  recovery_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_credentials TO authenticated;
GRANT ALL ON public.property_credentials TO service_role;
ALTER TABLE public.property_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own credentials" ON public.property_credentials FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_property_credentials_touch BEFORE UPDATE ON public.property_credentials FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_credentials_property ON public.property_credentials(property_id);

-- ============ property_tasks ============
CREATE TABLE IF NOT EXISTS public.property_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  assignee TEXT,
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta','urgente')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','cancelada','aguardando_terceiros')),
  notes TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_tasks TO authenticated;
GRANT ALL ON public.property_tasks TO service_role;
ALTER TABLE public.property_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks" ON public.property_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_property_tasks_touch BEFORE UPDATE ON public.property_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_tasks_property ON public.property_tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON public.property_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.property_tasks(due_date);
