# Plan - Corrigir e ampliar a busca principal do Cofre de Comprovantes

A meta é transformar a busca do Cofre em uma pesquisa global real, abrangendo valores, datas, descrições, metadados e entidades relacionadas (categorias, perfis, bancos, imóveis, contas e cartões), mantendo a execução no servidor via Supabase.

## User Review Required

> [!IMPORTANT]
> A busca global envolverá múltiplas tabelas. Para manter a performance e a simplicidade da consulta, utilizaremos subconsultas de ID para entidades relacionadas (como categorias e perfis).

- [ ] A busca por valor deve ser exata? (Atualmente sim, baseada no `amount.eq.numeric`).
- [ ] A busca por data deve sobrepor os filtros de data "DE/ATÉ" se for digitada na barra? (O requisito diz "dentro dos demais filtros ativos", então será uma restrição adicional `payment_date.eq`).

## Technical Details

### 1. Refatoração da Lógica de Busca no Frontend (`src/routes/_authenticated/app.vault.tsx`)
- Implementar a captura de `rawSearch` e `textSearch`.
- Adicionar normalização de data (BR/ISO) e valor financeiro (BR com vírgula).
- Adicionar normalização de CPF/CNPJ (apenas números).
- Traduzir termos de interface (Pix, Boleto, etc.) para os enums do banco.

### 2. Ampliação da Consulta Supabase (`receipts` query)
- Expandir o `.or()` para incluir:
    - `description`, `notes`, `recipient_name`, `recipient_tax_id`, `bank_name`, `auth_code`, `file_name` (ILIKE).
    - `amount` (EQ se numérico).
    - `payment_date` (EQ se data válida).
    - Subconsultas para `category_id`, `profile_id`, `bank_id`, `property_id`, `account_id`, `card_id` baseadas em nomes/metadados das tabelas relacionadas.

### 3. Ajustes de UI
- Alterar o placeholder do `Input` de busca para: "Buscar por qualquer informação: valor, data, descrição, destinatário, banco…".
- Manter o debounce de 350ms.

### 4. Validação e Auditoria
- Realizar testes via Playwright para garantir que:
    - "3321,70" e "R$ 3.321,70" encontram o mesmo registro.
    - "03/08/2026" filtra corretamente por data.
    - Busca por "Holding" retorna registros do perfil correspondente.
    - Busca por categoria (ex: "Impostos") funciona via relacionamento.
- Atualizar a lista de auditoria na `Landing Page` (`src/routes/index.tsx`) com os novos pontos.
