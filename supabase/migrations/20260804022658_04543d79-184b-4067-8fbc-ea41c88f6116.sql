
DO $$ 
BEGIN
    -- 1. Unificar Imóveis Duplicados
    -- Raguna Cabral
    UPDATE public.receipts SET property_id = '3af525ac-9572-4d40-8557-a729802b67e9' WHERE property_id = '08ec8058-32b9-4d09-800e-7abced06523c';
    UPDATE public.property_obligations SET property_id = '3af525ac-9572-4d40-8557-a729802b67e9' WHERE property_id = '08ec8058-32b9-4d09-800e-7abced06523c';
    UPDATE public.property_credentials SET property_id = '3af525ac-9572-4d40-8557-a729802b67e9' WHERE property_id = '08ec8058-32b9-4d09-800e-7abced06523c';
    DELETE FROM public.properties WHERE id = '08ec8058-32b9-4d09-800e-7abced06523c';

    -- Comandante Taylor nº 328
    UPDATE public.receipts SET property_id = 'f3691b41-7de7-49a7-a94a-b3a741eeea4f' WHERE property_id = 'f249adbf-85dc-4357-9a0d-0baed1f30706';
    UPDATE public.property_obligations SET property_id = 'f3691b41-7de7-49a7-a94a-b3a741eeea4f' WHERE property_id = 'f249adbf-85dc-4357-9a0d-0baed1f30706';
    UPDATE public.property_credentials SET property_id = 'f3691b41-7de7-49a7-a94a-b3a741eeea4f' WHERE property_id = 'f249adbf-85dc-4357-9a0d-0baed1f30706';
    DELETE FROM public.properties WHERE id = 'f249adbf-85dc-4357-9a0d-0baed1f30706';

    -- Ernesto de Fiori
    UPDATE public.receipts SET property_id = 'a97ee800-0e90-4401-b41e-50c031deb5ab' WHERE property_id = '46ff8b8f-b976-4dea-9573-94b9e1cb2924';
    UPDATE public.property_obligations SET property_id = 'a97ee800-0e90-4401-b41e-50c031deb5ab' WHERE property_id = '46ff8b8f-b976-4dea-9573-94b9e1cb2924';
    UPDATE public.property_credentials SET property_id = 'a97ee800-0e90-4401-b41e-50c031deb5ab' WHERE property_id = '46ff8b8f-b976-4dea-9573-94b9e1cb2924';
    DELETE FROM public.properties WHERE id = '46ff8b8f-b976-4dea-9573-94b9e1cb2924';

    -- Marquês de Maricá
    UPDATE public.receipts SET property_id = '74b998b1-f808-4df5-bc2f-fff5bdae80de' WHERE property_id = '0a5eef65-e867-4495-829e-de2ad1828009';
    UPDATE public.property_obligations SET property_id = '74b998b1-f808-4df5-bc2f-fff5bdae80de' WHERE property_id = '0a5eef65-e867-4495-829e-de2ad1828009';
    UPDATE public.property_credentials SET property_id = '74b998b1-f808-4df5-bc2f-fff5bdae80de' WHERE property_id = '0a5eef65-e867-4495-829e-de2ad1828009';
    DELETE FROM public.properties WHERE id = '0a5eef65-e867-4495-829e-de2ad1828009';

    -- Francisco de Souza
    UPDATE public.receipts SET property_id = 'e42b5f9e-6e18-419e-b812-07862ec18445' WHERE property_id IN ('e1829157-94a6-4997-957c-75463aae2d1d', '113fa9c6-6ca1-46ca-be53-fd54a42e82a5');
    UPDATE public.property_obligations SET property_id = 'e42b5f9e-6e18-419e-b812-07862ec18445' WHERE property_id IN ('e1829157-94a6-4997-957c-75463aae2d1d', '113fa9c6-6ca1-46ca-be53-fd54a42e82a5');
    UPDATE public.property_credentials SET property_id = 'e42b5f9e-6e18-419e-b812-07862ec18445' WHERE property_id IN ('e1829157-94a6-4997-957c-75463aae2d1d', '113fa9c6-6ca1-46ca-be53-fd54a42e82a5');
    DELETE FROM public.properties WHERE id IN ('e1829157-94a6-4997-957c-75463aae2d1d', '113fa9c6-6ca1-46ca-be53-fd54a42e82a5');

    -- Manifesto
    UPDATE public.receipts SET property_id = '58d9bf97-05a4-4085-9c2d-2579c82a594c' WHERE property_id IN ('f0822467-63d1-4262-9dac-5defd54da5ae', 'e01bbfe4-2c7b-4b90-afaf-c98f15b08bea');
    UPDATE public.property_obligations SET property_id = '58d9bf97-05a4-4085-9c2d-2579c82a594c' WHERE property_id IN ('f0822467-63d1-4262-9dac-5defd54da5ae', 'e01bbfe4-2c7b-4b90-afaf-c98f15b08bea');
    UPDATE public.property_credentials SET property_id = '58d9bf97-05a4-4085-9c2d-2579c82a594c' WHERE property_id IN ('f0822467-63d1-4262-9dac-5defd54da5ae', 'e01bbfe4-2c7b-4b90-afaf-c98f15b08bea');
    DELETE FROM public.properties WHERE id IN ('f0822467-63d1-4262-9dac-5defd54da5ae', 'e01bbfe4-2c7b-4b90-afaf-c98f15b08bea');

    -- José Lins do Rego
    UPDATE public.receipts SET property_id = 'edf6c88c-6040-4560-82e6-315c555f2cf9' WHERE property_id = '88dd2299-a6f3-4a6d-90a2-6202d05e6077';
    UPDATE public.property_obligations SET property_id = 'edf6c88c-6040-4560-82e6-315c555f2cf9' WHERE property_id = '88dd2299-a6f3-4a6d-90a2-6202d05e6077';
    UPDATE public.property_credentials SET property_id = 'edf6c88c-6040-4560-82e6-315c555f2cf9' WHERE property_id = '88dd2299-a6f3-4a6d-90a2-6202d05e6077';
    DELETE FROM public.properties WHERE id = '88dd2299-a6f3-4a6d-90a2-6202d05e6077';

    -- 2. Unificar Categorias Duplicadas
    -- Cartório
    UPDATE public.receipts SET category_id = 'a545590a-ef43-4d02-9991-17a421e2f86a' WHERE category_id IN ('f446398d-cce0-47ef-9e10-2c1fabaea5aa', '6c107dd7-c84a-4b49-b3af-cc20b37715ad');
    DELETE FROM public.categories WHERE id IN ('f446398d-cce0-47ef-9e10-2c1fabaea5aa', '6c107dd7-c84a-4b49-b3af-cc20b37715ad');

    -- Consórcio
    UPDATE public.receipts SET category_id = '5c819a6f-3993-4a70-9856-f68c49b89620' WHERE category_id = 'b1477259-368d-4d03-9093-738254e49111';
    DELETE FROM public.categories WHERE id = 'b1477259-368d-4d03-9093-738254e49111';

    -- Correios
    UPDATE public.receipts SET category_id = '77cb29c3-4142-410a-b821-98889117f3b2' WHERE category_id IN ('39561935-d5a0-4359-a1e5-bb9c1ae2bbee', '253a4dbd-0a7d-42a6-bfeb-480e6411529e');
    DELETE FROM public.categories WHERE id IN ('39561935-d5a0-4359-a1e5-bb9c1ae2bbee', '253a4dbd-0a7d-42a6-bfeb-480e6411529e');

    -- Doação
    UPDATE public.receipts SET category_id = '84806b93-6850-49ff-b370-a26dde1ebda6' WHERE category_id = '6ea59823-dc14-4c60-ba31-35129ac3e48e';
    DELETE FROM public.categories WHERE id = '6ea59823-dc14-4c60-ba31-35129ac3e48e';

    -- Entretenimento
    UPDATE public.receipts SET category_id = '3ae4963c-d497-46f5-a35f-fbabb7f606a2' WHERE category_id = '63d8c8cd-7264-45d9-9e67-579ab7e7fd9c';
    DELETE FROM public.categories WHERE id = '63d8c8cd-7264-45d9-9e67-579ab7e7fd9c';

    -- Despesas fixas
    UPDATE public.receipts SET category_id = '18268d6a-9b1b-4142-8185-cc0736fd4bc0' WHERE category_id = '4901ae4b-825d-468d-975f-226f6893d953';
    DELETE FROM public.categories WHERE id = '4901ae4b-825d-468d-975f-226f6893d953';

    -- Caminhão
    UPDATE public.receipts SET category_id = '03a95523-a023-4c70-81ff-39782efea668' WHERE category_id = 'e34ab9f6-b42f-4c0c-854f-34063fde56a2';
    DELETE FROM public.categories WHERE id = 'e34ab9f6-b42f-4c0c-854f-34063fde56a2';
END $$;
