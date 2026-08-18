-- Enum para status da análise
create type public.receipt_analysis_status as enum (
  'processing',
  'already_posted',
  'not_found',
  'possible_match',
  'unreadable',
  'duplicate_in_zip',
  'error'
);

-- Tabela para lotes de análise
create table public.receipt_analysis_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  file_name text not null,
  status text not null default 'processing', -- 'processing', 'finished', 'error'
  files_total int not null default 0,
  files_processed int not null default 0,
  already_found int not null default 0,
  not_found int not null default 0,
  needs_review int not null default 0,
  errors int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Tabela para arquivos individuais da análise
create table public.receipt_analysis_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.receipt_analysis_batches(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- Metadados do arquivo
  original_path text not null,
  file_name text not null,
  extension text,
  mime_type text,
  size_bytes bigint,
  content_hash text,
  storage_path text,
  
  -- Dados extraídos
  extracted_text text,
  ocr_data jsonb,
  ai_extracted_data jsonb,
  
  -- Campos estruturados (para busca rápida e UI)
  amount numeric(20,2),
  payment_date date,
  recipient_name text,
  recipient_tax_id text,
  bank_name text,
  payment_method text,
  auth_code text,
  transaction_id text,
  
  -- Resultado da análise
  analysis_status public.receipt_analysis_status not null default 'processing',
  candidate_receipt_id uuid references public.receipts(id) on delete set null,
  similarity_score int, -- 0-100
  matched_fields text[],
  different_fields text[],
  analysis_reason text,
  
  created_at timestamptz not null default now()
);

-- Segurança (RLS)
alter table public.receipt_analysis_batches enable row level security;
alter table public.receipt_analysis_files enable row level security;

-- Grants
grant select, insert, update, delete on public.receipt_analysis_batches to authenticated;
grant all on public.receipt_analysis_batches to service_role;

grant select, insert, update, delete on public.receipt_analysis_files to authenticated;
grant all on public.receipt_analysis_files to service_role;

-- Políticas
create policy "Users can manage their own analysis batches"
  on public.receipt_analysis_batches
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own analysis files"
  on public.receipt_analysis_files
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Índices para performance
create index idx_analysis_batches_user_id on public.receipt_analysis_batches(user_id);
create index idx_analysis_files_batch_id on public.receipt_analysis_files(batch_id);
create index idx_analysis_files_content_hash on public.receipt_analysis_files(content_hash);
create index idx_analysis_files_status on public.receipt_analysis_files(analysis_status);

