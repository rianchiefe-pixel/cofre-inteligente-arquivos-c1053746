-- Keep the constraint aligned with every kind offered by the PF and property forms.
ALTER TABLE public.property_obligations
  DROP CONSTRAINT IF EXISTS property_obligations_kind_check;

ALTER TABLE public.property_obligations
  ADD CONSTRAINT property_obligations_kind_check
  CHECK (kind = ANY (ARRAY[
    'iptu', 'lixo', 'condominio', 'agua', 'energia', 'internet', 'limpeza', 'gas',
    'irpf', 'itr', 'inss', 'certificado_digital', 'taxa', 'taxa_municipal',
    'taxa_estadual', 'taxa_federal', 'servico', 'seguro', 'financiamento',
    'outro_pf', 'outro'
  ]));
