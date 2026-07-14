# Plano — Importação Inteligente Profunda

Objetivo: priorizar **precisão** sobre velocidade. Ler 100% dos comprovantes, isolar transações de cartão de crédito, cruzar com múltiplos sinais e apresentar um relatório segmentado.

## 1. Leitura completa dos comprovantes (`src/lib/zip-import.ts`)

- Remover atalhos que marcam arquivos como processados sem OCR concluído.
- Forçar OCR de imagens sempre (não opcional quando o usuário aciona "análise profunda").
- Para PDFs: extrair texto embutido **e**, se abaixo de N caracteres úteis, rodar OCR página a página via `pdfjs-dist` + `tesseract.js`.
- Persistir campos estruturados em `import_files.ocr_data`:
  `amount`, `date`, `payee`, `payer`, `description`, `payment_method`, `bank`, `document_id`.
- Extração por regex (pt-BR): "R$ ...", "Data ...", "Destinatário/Favorecido", "Pagador", "ID da transação/E2E/Autenticação", "Banco ...", "PIX/TED/DOC/Boleto".
- Marcar `status = 'unreadable'` (nova categoria) quando OCR não retorna texto mínimo, em vez de silenciosamente falhar.
- Barra de progresso agora aguarda **todos** os arquivos antes de liberar o cruzamento (bloqueia botão de matching enquanto `pending > 0`).

## 2. Classificação da planilha (`src/lib/import.functions.ts`)

Nova função `classifyRowKind(description, payment_method)` — determinística por regex, retornando:

```
kind: 'cartao_credito' | 'cartao_fatura' | 'pix' | 'ted_doc' | 'boleto'
    | 'debito' | 'saque' | 'deposito' | 'tarifa' | 'rendimento'
    | 'investimento' | 'transferencia' | 'outro'
```

Padrões: `/fatura|cartão|cartao\s+cred|compra\s+cartao/i` → `cartao_*`; `/pix\s+(env|receb)/i` → `pix`; `/ted|doc\b/i` → `ted_doc`; `/boleto|cobrança/i` → `boleto`; `/saque/i` → `saque`; `/rendimento|juros|cdb|tesouro/i` → `rendimento/investimento`; etc.

Persistir em nova coluna `import_rows.kind` (migration). Preencher no insert e num backfill `reclassifyBatchKinds(batchId)`.

## 3. Segregação de cartão de crédito (`src/lib/receipt-matcher.ts`)

- Antes de qualquer matching, filtrar `rows` com `kind IN ('cartao_credito','cartao_fatura')` — essas **não entram** no cruzamento comum.
- Elas ficam disponíveis num bucket separado "Transações de cartão de crédito".
- Só recebem vínculo se houver comprovante cujo OCR contenha explicitamente marcadores de cartão (`/fatura|cartão de crédito|final \d{4}/i`) e trio (valor+data+favorecido).

## 4. Cruzamento com múltiplos sinais (`src/lib/receipt-matcher.ts`)

Reescrever `gatedTier` como um **score ponderado** com portão duro:

Portão duro (obrigatório): `|amount_row - amount_file| ≤ 0.02` E `|date_row - date_file| ≤ 2 dias`.

Score adicional (0–100):
- Favorecido fuzzy (Jaro-Winkler ≥ 0.85): +30
- Método de pagamento coincide: +15
- Banco coincide: +10
- Descrição contém tokens-chave (≥ 2): +15
- ID de documento (E2E/autenticação) coincide: +30 (bônus decisivo)
- Preferência histórica do usuário (`import_preferences`): +20

Confiança final:
- `very_high` ≥ 80 ou match por documento
- `high` ≥ 60
- `medium` ≥ 40 → **não vincula automaticamente**, vai para bucket "para conferir"
- `< 40` → não vincula

Regra 1:1 mantida (índice único já existe). Se um arquivo tem múltiplos candidatos ≥ 60, escolhe o de maior score; empate → mantém sem vínculo.

## 5. Relatório final (`src/routes/_authenticated/app.import.tsx` + `src/components/import-matches.tsx`)

Novos cards/abas:

1. Vinculados (very_high + high)
2. Lançamentos sem comprovante
3. Comprovantes sem lançamento
4. Transações de cartão de crédito (bucket isolado)
5. Arquivos ilegíveis (`status = 'unreadable'`)
6. Possíveis duplicidades (`status = 'duplicate'` + rows com valor+data+payee iguais)

Botão "Cruzar comprovantes" desabilitado até `filesProcessed === filesFound` **e** `unreadable` for revisado (opção "Ignorar ilegíveis e prosseguir").

## Migrations

```sql
ALTER TABLE import_rows ADD COLUMN kind text;
CREATE INDEX import_rows_kind_idx ON import_rows(batch_id, kind);
ALTER TABLE import_files ADD COLUMN parsed_fields jsonb;
-- 'unreadable' já cabe em status text; sem constraint a mudar.
```

## Arquivos tocados

- `src/lib/zip-import.ts` — OCR obrigatório, extração estruturada, status `unreadable`.
- `src/lib/import.functions.ts` — `classifyRowKind`, `reclassifyBatchKinds`, persistir `kind`.
- `src/lib/receipt-matcher.ts` — reescrita do scoring + segregação de cartão.
- `src/routes/_authenticated/app.import.tsx` — 6 buckets, bloqueio do botão, contadores.
- `src/components/import-matches.tsx` — aba "Cartão de crédito" e "Ilegíveis".
- Migration com 2 colunas + índice.

## Fora do escopo (por enquanto)

- Reprocessamento retroativo de lotes antigos: exposto via botão "Reanalisar lote" existente, sem migração de dados históricos.
- OCR de PDFs com senha.
