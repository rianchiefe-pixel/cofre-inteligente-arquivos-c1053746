import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { annotationSchema } from "./annotations";

export const listAnnotations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const notes = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await context.supabase.from("annotations")
        .select("*, annotation_attachments(*)").eq("user_id", context.userId)
        .order("updated_at", { ascending: false }).order("id").range(offset, offset + 499);
      if (error) throw error;
      notes.push(...data);
      if (data.length < 500) break;
    }
    const properties = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await context.supabase.from("properties")
        .select("id, name, status").eq("user_id", context.userId).order("name").order("id").range(offset, offset + 499);
      if (error) throw error;
      properties.push(...data);
      if (data.length < 500) break;
    }
    return { notes, properties, userId: context.userId };
  });
export const annotationsQuery = queryOptions({ queryKey: ["annotations"], queryFn: () => listAnnotations(), staleTime: 30_000 });

export const saveAnnotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((input) => annotationSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.files.some((f) => !f.file_path.startsWith(`${context.userId}/${data.id}/`))) throw new Error("Anexo inválido.");
    const { files, ...note } = data;
    const { data: id, error } = await context.supabase.rpc("save_annotation_rpc", { p_note: note, p_files: files });
    if (error) throw error;
    return { id };
  });
export const deleteAnnotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((input) => z.object({ id: z.uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: note, error } = await context.supabase.from("annotations").select("id, annotation_attachments(file_path)").eq("id", data.id).eq("user_id", context.userId).single();
    if (error) throw error;
    const paths = note.annotation_attachments.map((f) => f.file_path);
    if (paths.length) {
      const { error: fileError } = await context.supabase.storage.from("notes-attachments").remove(paths);
      if (fileError) throw fileError;
    }
    const { error: deleteError } = await context.supabase.from("annotations").delete().eq("id", note.id).eq("user_id", context.userId);
    if (deleteError) throw deleteError;
    return { ok: true };
  });