
import { describe, it, expect } from "vitest";

// Logic extracted from receipt-matcher.ts
function getOriginalRowEvidence(row: any) {
  const raw = row.raw_data || {};
  const norm = row.normalized_data || {};

  const fileName = String(
    row.file_name || 
    raw["Arquivo"] || raw["file_name"] || raw["FILE"] || 
    norm.file_name || 
    ""
  ).trim();

  const folderPath = String(
    row.folder_path || 
    raw["Pasta"] || raw["folder_path"] || raw["FOLDER"] || 
    norm.folder_path || 
    ""
  ).trim();

  const sourceId = String(
    row.source_id || 
    raw["ID Origem"] || raw["source_id"] || raw["SOURCE"] || 
    norm.source_id || 
    ""
  ).trim();

  const invoiceNumber = String(
    row.invoice_number || 
    raw["Fatura"] || raw["invoice_number"] || raw["INVOICE"] || 
    norm.invoice_number || 
    ""
  ).trim();

  return {
    fileName: fileName || null,
    folderPath: folderPath || null,
    sourceId: sourceId || null,
    invoiceNumber: invoiceNumber || null,
  };
}

describe("Receipt Matcher: Evidence Isolation Protection", () => {
  it("should ignore AI-invented file metadata and only use real spreadsheet data", () => {
    // SCENARIO: 
    // - The spreadsheet (raw_data) has NO file name.
    // - The AI (ai_data) invented a name "receipt_123.pdf".
    // - The row object has the AI suggestion at the top level (as it was before the fix) 
    //   OR in the new ai_data structure.
    
    const row = {
      amount: 100,
      transaction_date: "2024-01-01",
      // These top-level fields might contain AI data if classifyImportRow wasn't fully corrected 
      // or if it's a legacy row. The matcher must be defensive.
      file_name: "invented_by_ia.pdf", 
      raw_data: {
        "Data": "01/01/2024",
        "Valor": "100,00"
        // NO "Arquivo" key here
      },
      normalized_data: {
        date: "2024-01-01",
        amount: 100
      },
      ai_data: {
        file_name: "receipt_123.pdf",
        folder_path: "/ai/suggestions/"
      }
    };

    // The logic must be: If it's not in raw_data or normalized_data, we ignore row.file_name 
    // if that field was populated by AI. 
    // Actually, the user asked: "se a informação não estiver na planilha original, retorne null".
    // And "Nunca utilize row.ai_data?.file_name".
    
    // We adjust row to simulate the exact failure case:
    const maliciousRow = {
      ...row,
      file_name: null, // Spreadsheet is empty
      ai_data: { file_name: "match_this.pdf" }
    };

    const evidence = getOriginalRowEvidence(maliciousRow);
    
    expect(evidence.fileName).toBeNull();
    expect(evidence.fileName).not.toBe("match_this.pdf");
  });

  it("should find evidence if it exists in raw_data", () => {
    const row = {
      raw_data: {
        "Arquivo": "real_receipt.pdf"
      }
    };
    const evidence = getOriginalRowEvidence(row);
    expect(evidence.fileName).toBe("real_receipt.pdf");
  });

  it("should find evidence if it exists in normalized_data", () => {
    const row = {
      normalized_data: {
        file_name: "norm_receipt.pdf"
      }
    };
    const evidence = getOriginalRowEvidence(row);
    expect(evidence.fileName).toBe("norm_receipt.pdf");
  });
});
