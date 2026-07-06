
CREATE TYPE public.property_type AS ENUM ('casa','apartamento','terreno','sala_comercial','fazenda','predio','outro');
CREATE TYPE public.property_status AS ENUM ('proprio','alugado','em_reforma','vendido','em_aquisicao');

CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.financial_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type public.property_type NOT NULL DEFAULT 'casa',
  address TEXT,
  city TEXT,
  state TEXT,
  registration TEXT,
  owner_name TEXT,
  status public.property_status NOT NULL DEFAULT 'proprio',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own properties" ON public.properties
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER properties_touch BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX properties_user_id_idx ON public.properties(user_id);
CREATE INDEX properties_profile_id_idx ON public.properties(profile_id);

ALTER TABLE public.receipts ADD COLUMN property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL;
CREATE INDEX receipts_property_id_idx ON public.receipts(property_id);
