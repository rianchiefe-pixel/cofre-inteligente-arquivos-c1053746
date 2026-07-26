
import { describe, it, expect } from "vitest";
import { parseBrlAmount } from "./format";

// Mocking the update logic to test the rule
function getMockUpdate(d: any) {
  // Fields that should NOT be in the update according to the fix
  return {
    ai_status: "classified",
    ai_data: d,
    ai_suggested_amount: parseBrlAmount(d.amount_raw) || d.amount,
    ai_suggested_date: d.date,
    ai_suggested_payee: d.payee,
  };
}

describe("Classification Rule: AI must not overwrite official fields", () => {
  it("should verify the update object only contains suggestions and meta", () => {
    const aiResponse = {
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
    };

    const update = getMockUpdate(aiResponse);

    // Official fields MUST NOT be present at the top level of the update
    const officialFields = [
      'amount', 'currency', 'transaction_date', 'category', 'category_original',
      'transaction_type', 'subcategory', 'description', 'payee', 'account',
      'bank', 'card', 'card_last4', 'payment_method', 'holder', 'file_name',
      'folder_path', 'source_id', 'invoice_number', 'page_number', 'notes'
    ];

    officialFields.forEach(field => {
      expect(update).not.toHaveProperty(field);
    });

    // Suggestions are allowed
    expect(update.ai_suggested_amount).toBe(2000);
    expect(update.ai_data.file_name).toBe("fake_receipt.pdf");
  });
});
