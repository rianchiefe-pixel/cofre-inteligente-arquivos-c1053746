-- Update categories to fixed for the specific user
UPDATE public.categories 
SET expense_behavior = 'fixed' 
WHERE user_id = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e' 
AND name IN ('APAE', 'Pensão Alimentícia - Erick', 'Pensão Erick', 'Cond Sala comercial', 'Casa 25 - Cota Condominial', 'COND CASA 25', 'Casa 26 - Cota Condominial', 'Cond Casa 26', 'KUMON inglês Ana e Erick', 'Educação', 'Educação Henrique', 'Educação Ana e Erick', 'Internet', 'Internet/Telefone', 'Internet e TV', 'Convênio médico', 'Plano de Saúde', 'Academia e Esportes', 'Seguro de Veículos', 'Seguros Carro') 
AND (expense_behavior IS NULL OR expense_behavior = 'null');

-- Update categories to variable
UPDATE public.categories 
SET expense_behavior = 'variable' 
WHERE user_id = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e' 
AND name IN ('Pediatra Henrique', 'Combustível', 'Diarista', 'Farmácia', 'Personal Ana', 'Personal Leila e Gilberto', 'Alimentação Henrique', 'Alimentação Ana', 'Alimentação Ana e Erick', 'Comida/Bebidas', 'Comer fora', 'iFood', 'Restaurante Escolar', 'Restaurante Gilberto') 
AND (expense_behavior IS NULL OR expense_behavior = 'null');

-- Archive and cleanup [MERGED] categories
UPDATE public.categories 
SET expense_behavior = NULL, archived = true 
WHERE user_id = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e' 
AND name LIKE '[MERGED]%';
