import assert from "node:assert/strict";
import { test } from "node:test";
import { annotationSchema, annotationPath } from "./annotations";
const base = { id: "d4f848c0-fec5-4a2c-b0e8-6fc4eaa76bbb", title: "", description: "", body: "", note_date: "", property_id: "", files: [] };
test("anotação aceita somente texto, sem imóvel e sem metadados", () => {
  assert.equal(annotationSchema.safeParse({ ...base, body: "Informação livre" }).success, true);
});
test("anotação aceita somente arquivo sem texto, título, descrição, data ou imóvel", () => {
  assert.equal(annotationSchema.safeParse({ ...base, files: [{ file_path: "usuario/arquivo", file_name: "foto.png", mime_type: "image/png", size_bytes: 100 }] }).success, true);
});
test("anotação completamente vazia não é salva", () => {
  assert.equal(annotationSchema.safeParse(base).success, false);
});
test("vínculo com imóvel é opcional e aceita ID real", () => {
  assert.equal(annotationSchema.safeParse({ ...base, body: "Contrato", property_id: "2cf3c250-47ce-4e34-8f64-89c69f5fb9e6" }).success, true);
  assert.equal(annotationSchema.safeParse({ ...base, body: "Contrato", property_id: "inválido" }).success, false);
});
test("nome com caracteres especiais não contamina o caminho privado", () => {
  const path = annotationPath("usuario", base.id, "Anotação & orçamento final.pdf");
  assert.match(path, /^usuario\/d4f848c0-fec5-4a2c-b0e8-6fc4eaa76bbb\/[a-f0-9-]+\.pdf$/);
});