
-- Enum types
CREATE TYPE public.profile_type AS ENUM ('pessoa_fisica','empresa','holding','imovel','projeto','outro');
CREATE TYPE public.account_type AS ENUM ('corrente','poupanca','pj','investimento','cartao','carteira_digital','outro');
CREATE TYPE public.card_brand AS ENUM ('visa','mastercard','elo','amex','hipercard','outro');
CREATE TYPE public.payment_method AS ENUM ('debito','credito_vista','credito_parcelado','pix','ted','boleto','dinheiro','transferencia','outro');
CREATE TYPE public.transaction_type AS ENUM ('despesa','investimento','gasto_fixo','gasto_variavel','pessoal','empresarial','patrimonial');
CREATE TYPE public.receipt_status AS ENUM ('pending','approved','rejected','duplicate');
CREATE TYPE public.ocr_status AS ENUM ('queued','processing','done','failed');

-- Financial profiles
CREATE TABLE public.financial_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.profile_type NOT NULL DEFAULT 'pessoa_fisica',
  tax_id TEXT,
  color TEXT DEFAULT '#1e3a8a',
  logo_url TEXT,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_profiles TO authenticated;
GRANT ALL ON public.financial_profiles TO service_role;
ALTER TABLE public.financial_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profiles" ON public.financial_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Banks
CREATE TABLE public.banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.financial_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#64748b',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banks TO authenticated;
GRANT ALL ON public.banks TO service_role;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own banks" ON public.banks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Accounts
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.financial_profiles(id) ON DELETE CASCADE,
  bank_id UUID REFERENCES public.banks(id) ON DELETE SET NULL,
  type public.account_type NOT NULL DEFAULT 'corrente',
  nickname TEXT NOT NULL,
  holder TEXT,
  agency TEXT,
  number TEXT,
  color TEXT DEFAULT '#0ea5e9',
  initial_balance NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Cards
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.financial_profiles(id) ON DELETE CASCADE,
  bank_id UUID REFERENCES public.banks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brand public.card_brand DEFAULT 'outro',
  last4 TEXT,
  limit_amount NUMERIC(14,2),
  closing_day SMALLINT,
  due_day SMALLINT,
  holder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cards" ON public.cards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Categories (per user)
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  default_type public.transaction_type DEFAULT 'gasto_variavel',
  color TEXT DEFAULT '#334155',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Recipients
CREATE TABLE public.recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_id TEXT,
  default_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  default_type public.transaction_type DEFAULT 'gasto_variavel',
  default_profile_id UUID REFERENCES public.financial_profiles(id) ON DELETE SET NULL,
  notes TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipients TO authenticated;
GRANT ALL ON public.recipients TO service_role;
ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recipients" ON public.recipients FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX recipients_user_name_taxid_idx ON public.recipients(user_id, lower(name), COALESCE(tax_id,''));

-- Receipts
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.financial_profiles(id) ON DELETE SET NULL,
  bank_id UUID REFERENCES public.banks(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES public.recipients(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_mime TEXT,
  file_size BIGINT,
  file_hash TEXT,
  ocr_status public.ocr_status NOT NULL DEFAULT 'queued',
  ocr_data JSONB,
  ocr_error TEXT,
  payment_date DATE,
  amount NUMERIC(14,2),
  recipient_name TEXT,
  recipient_tax_id TEXT,
  bank_name TEXT,
  payment_method public.payment_method,
  description TEXT,
  auth_code TEXT,
  transaction_type public.transaction_type,
  is_fixed BOOLEAN DEFAULT false,
  status public.receipt_status NOT NULL DEFAULT 'pending',
  duplicate_of UUID REFERENCES public.receipts(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own receipts" ON public.receipts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX receipts_user_created_idx ON public.receipts(user_id, created_at DESC);
CREATE INDEX receipts_hash_idx ON public.receipts(user_id, file_hash);
CREATE INDEX receipts_dedupe_idx ON public.receipts(user_id, amount, payment_date, auth_code);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_touch_profiles BEFORE UPDATE ON public.financial_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_receipts BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed default categories on user signup
CREATE OR REPLACE FUNCTION public.seed_default_data_for_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, default_type) VALUES
    (NEW.id,'Imóveis','patrimonial'),
    (NEW.id,'Condomínio','gasto_fixo'),
    (NEW.id,'Energia','gasto_variavel'),
    (NEW.id,'Água','gasto_variavel'),
    (NEW.id,'Internet','gasto_fixo'),
    (NEW.id,'IPTU','gasto_fixo'),
    (NEW.id,'Reforma','patrimonial'),
    (NEW.id,'Material de construção','patrimonial'),
    (NEW.id,'Mão de obra','despesa'),
    (NEW.id,'Contabilidade','empresarial'),
    (NEW.id,'Jurídico','empresarial'),
    (NEW.id,'Educação','pessoal'),
    (NEW.id,'Saúde','pessoal'),
    (NEW.id,'Transporte','gasto_variavel'),
    (NEW.id,'Alimentação','gasto_variavel'),
    (NEW.id,'Mercado','gasto_variavel'),
    (NEW.id,'Assinaturas','gasto_fixo'),
    (NEW.id,'Cartão de crédito','despesa'),
    (NEW.id,'Investimentos','investimento'),
    (NEW.id,'Impostos','despesa'),
    (NEW.id,'Outros','gasto_variavel');
  INSERT INTO public.financial_profiles (user_id, name, type, color)
    VALUES (NEW.id, 'Pessoal', 'pessoa_fisica', '#1e3a8a');
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_seed
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_data_for_user();
