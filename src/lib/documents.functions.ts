import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getDocumentSignedUrl = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ path: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: res, error } = await supabaseAdmin.storage
      .from("property_documents")
      .createSignedUrl(data.path, 3600);

    if (error) throw error;
    return res.signedUrl;
  });

export const savePropertyDocument = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    title: z.string(),
    category: z.string(),
    file_path: z.string(),
    file_type: z.string(),
    file_size: z.number().optional(),
    notes: z.string().optional(),
    original_filename: z.string().optional(),
    property_id: z.string(),
    profile_id: z.string(),
    user_id: z.string(),
    property_ids: z.array(z.string()).optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: doc, error: docError } = await supabaseAdmin
      .from("property_documents")
      .insert({
        title: data.title,
        category: data.category,
        file_path: data.file_path,
        file_type: data.file_type,
        file_size: data.file_size,
        notes: data.notes,
        original_filename: data.original_filename ?? null,
        user_id: data.user_id,
        profile_id: data.profile_id,
      })
      .select("id")
      .single();

    if (docError) throw docError;

    const propertyIds = data.property_ids || [data.property_id];
    const links = propertyIds.map((pid) => ({
      document_id: doc.id,
      property_id: pid,
      user_id: data.user_id,
    }));

    const { error: linkError } = await supabaseAdmin
      .from("property_document_links")
      .insert(links);

    if (linkError) throw linkError;

    return { id: doc.id };
  });

export const deletePropertyDocument = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string(), file_path: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { error: storageError } = await supabaseAdmin.storage
      .from("property_documents")
      .remove([data.file_path]);

    if (storageError) throw storageError;

    const { error: dbError } = await supabaseAdmin
      .from("property_documents")
      .delete()
      .eq("id", data.id);

    if (dbError) throw dbError;

    return { success: true };
  });
