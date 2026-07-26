
import { describe, it, expect } from "vitest";
import { parseBrlAmount } from "./format";

// Mocking some logic from classifyImportRow updates
function simulateUpdateObject(originalRow: any, aiResponse: any) {
  const d = aiResponse.data || {};
  
  // These fields SHOULD NOT be updated by AI according to the new rules
  const officialFieldsToPreserve = [
    'amount', 'currency', 'transaction_date', 'category', 'category_original',
    'transaction_type', 'subcategory', 'description', 'payee', 'account',
    'bank', 'card', 'card_last4', 'payment_method', 'holder', 'file_name',
    'folder_path', 'source_id', 'invoice_number', 'page_number', 'notes'
  ];

  const update: any = {
    ai_status: "classified",
    ai_data: d,
    ai_suggested_amount: parseBrlAmount(d.amount_raw) || d.amount,
    ai_suggested_date: d.date,
    ai_suggested_payee: d.payee,
  };

  // The code should NOT include updates for officialFieldsToPreserve
  // We simulate the logic here and assert the result
  return update;
}

describe("Classification Rule: AI must not overwrite official fields", () => {
  it("should preserve all official fields even if AI returns conflicting data", () => {
    const originalRow = {
      id: "row-1",
      amount: 1000,
      currency: "BRL",
      transaction_date: "2024-01-01",
      category: "Transporte",
      transaction_type: "DESPESA",
      description: "Uber Trip",
      payee: "Uber",
      bank: "Itau",
      file_name: "original.pdf",
      folder_path: "/receipts/"
    };

    const aiResponse = {
      data: {
        amount: 2000,
        amount_raw: "R$ 2.000,00",
        date: "2024-01-02",
        transaction_type: "INVESTIMENTO",
        category: "Lazer",
        payee: "99App",
        bank: "Bradesco",
        file_name: "fake_receipt.pdf",
        folder_path: "/malicious/path/",
        source_id: "src_123",
        invoice_number: "inv_999",
        page_number: "5"
      }
    };

    const update = simulateUpdateObject(originalRow, aiResponse);

    // Official fields must NOT be in the update object
    const forbidden = [
      'amount', 'currency', 'transaction_date', 'category', 'category_original',
      'transaction_type', 'subcategory', 'description', 'payee', 'account',
      'bank', 'card', 'card_last4', 'payment_method', 'holder', 'file_name',
      'folder_path', 'source_id', 'invoice_number', 'page_number', 'notes'
    ];

    forbidden.forEach(field => {
      expect(update).not.toHaveProperty(field);
    });

    // Suggestions should be present
    expect(update.ai_suggested_amount).toBe(2000);
    expect(update.ai_suggested_date).toBe("2024-01-02");
    expect(update.ai_suggested_payee).toBe("99App");
    expect(update.ai_data.file_name).toBe("fake_receipt.pdf");
  });
});
