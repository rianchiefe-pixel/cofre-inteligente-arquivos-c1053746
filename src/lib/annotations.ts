import { z } from "zod";

export const annotationFileSchema = z.object({
  file_path: z.string().min(1), file_name: z.string().min(1),
  mime_type: z.string().min(1), size_bytes: z.number().nonnegative(),
});
export const annotationSchema = z.object({
  id: z.uuid(), title: z.string(), description: z.string(), body: z.string(),
  note_date: z.union([z.literal(""), z.iso.date()]),
  property_id: z.union([z.literal(""), z.uuid()]),
  files: z.array(annotationFileSchema),
}).refine((n) => Boolean(n.title.trim() || n.description.trim() || n.body.trim() || n.files.length), {
  message: "Adicione um texto ou arquivo.",
});
export type AnnotationInput = z.infer<typeof annotationSchema>;
export type AnnotationFile = z.infer<typeof annotationFileSchema>;
export function annotationPath(userId: string, noteId: string, filename: string) {
  const extension = filename.includes(".") ? filename.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") : "";
  return `${userId}/${noteId}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
}