
-- Extend property enums
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'galpao';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'lote';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'terreno_urbano';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'terreno_rural';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'em_inventario';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'arquivado';

-- Purpose enum
DO $$ BEGIN
  CREATE TYPE public.property_purpose AS ENUM ('moradia','aluguel','venda','investimento','uso_empresarial','rural','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add fields to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS cartorio text,
  ADD COLUMN IF NOT EXISTS owner_tax_id text,
  ADD COLUMN IF NOT EXISTS purpose public.property_purpose,
  ADD COLUMN IF NOT EXISTS acquisition_date date,
  ADD COLUMN IF NOT EXISTS acquisition_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS cover_url text;
