// Fonte única de verdade dos contadores de conciliação — servidor.
// Carrega TODOS os registros do lote com paginação interna (nenhum limite
// silencioso) e devolve o mesmo resumo consumido pelo painel e pelo JSON.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeReconciliation, type ReconciliationSummary } from "./reconciliation";

const PAGE = 1000;

async function fetchAll<T>(
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 200; page += 1) {
    const from = page * PAGE;
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as T[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

export const getReconciliationSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batchId: string }) => {
    if (!input?.batchId) throw new Error("batchId obrigatório");
    return input;
  })
  .handler(async ({ data, context }): Promise<ReconciliationSummary> => {
    const { supabase, userId } = context;
    const batchId = data.batchId;

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .select("id")
      .eq("id", batchId)
      .eq("user_id", userId)
      .maybeSingle();
    if (batchError) throw new Error(batchError.message);
    if (!batch) throw new Error("Lote não encontrado");

    const [rows, files, links, statements] = await Promise.all([
      fetchAll<any>((from, to) =>
        supabase
          .from("import_rows")
          .select("id, row_number, kind, amount, transaction_date, payee, description, review_status, card_last4")
          .eq("batch_id", batchId)
          .order("row_number")
          .range(from, to),
      ),
      fetchAll<any>((from, to) =>
        supabase
          .from("import_files")
          .select(
            "id, file_name, original_path, status, readable, duplicate_of, document_type, ocr_data, error_message, storage_path",
          )
          .eq("batch_id", batchId)
          .order("original_path")
          .range(from, to),
      ),
      fetchAll<any>((from, to) =>
        supabase
          .from("import_row_files")
          .select("row_id, file_id, is_primary, is_manual, confidence")
          .eq("batch_id", batchId)
          .range(from, to),
      ),
      fetchAll<any>((from, to) =>
        supabase
          .from("card_statements")
          .select("id, import_file_id")
          .eq("batch_id", batchId)
          .range(from, to),
      ),
    ]);

    const statementIds = statements.map((s) => s.id as string);
    let cardItems: any[] = [];
    if (statementIds.length > 0) {
      for (let i = 0; i < statementIds.length; i += 100) {
        const chunk = statementIds.slice(i, i + 100);
        const part = await fetchAll<any>((from, to) =>
          supabase
            .from("card_transactions")
            .select(
              "id, statement_id, txn_date, description, merchant_normalized, amount, last4, installment_current, installment_total, page_number, matched_import_row_id, match_status",
            )
            .in("statement_id", chunk)
            .range(from, to),
        );
        cardItems.push(...part);
      }
    }

    // Texto extraído é grande: usamos apenas o tamanho para o diagnóstico.
    const { data: lengths } = await supabase
      .from("import_files")
      .select("id, extracted_text")
      .eq("batch_id", batchId)
      .not("extracted_text", "is", null)
      .limit(5000);
    const lengthById = new Map<string, number>(
      (lengths ?? []).map((f: any) => [f.id as string, String(f.extracted_text ?? "").length]),
    );
    for (const f of files) f.extracted_text_length = lengthById.get(f.id) ?? 0;

    return summarizeReconciliation({
      batchId,
      rows,
      files,
      links,
      cardItems,
      statementCount: statements.length,
      statementFileIds: statements
        .map((s) => s.import_file_id as string | null)
        .filter((v): v is string => !!v),
    });
  });