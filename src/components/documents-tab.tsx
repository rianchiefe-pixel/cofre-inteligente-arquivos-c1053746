import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Trash2, Eye, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { savePropertyDocument, deletePropertyDocument, getDocumentSignedUrl } from "@/lib/documents.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DocumentsTab({ propertyId, userId, profileId }: { propertyId: string; userId: string; profileId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ title: "", category: "", notes: "" });

  const list = useQuery({
    queryKey: ["property-documents", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_document_links")
        .select("document:property_documents(*)")
        .eq("property_id", propertyId);
      if (error) throw error;
      return data.map((d: any) => d.document);
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo");
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("property_documents").upload(path, file);
      if (uploadError) throw uploadError;

      await savePropertyDocument({
        title: form.title,
        category: form.category,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
        notes: form.notes,
        property_id: propertyId,
        profile_id: profileId,
        user_id: userId,
      });
    },
    onSuccess: () => {
      toast.success("Documento enviado");
      setOpen(false);
      setFile(null);
      setForm({ title: "", category: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["property-documents", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (doc: any) => await deletePropertyDocument({ id: doc.id, file_path: doc.file_path }),
    onSuccess: () => { toast.success("Documento removido"); qc.invalidateQueries({ queryKey: ["property-documents", propertyId] }); },
  });

  const getUrl = useServerFn(getDocumentSignedUrl);

  const openDoc = async (path: string) => {
    const url = await getUrl({ path });
    window.open(url, "_blank");
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Documentos do imóvel</h3>
          <p className="text-sm text-muted-foreground">Upload de documentos, certificados e contratos.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="premium" size="sm"><Plus className="h-4 w-4" /> Novo documento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo documento</DialogTitle></DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Arquivo</Label>
                <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>Enviar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-2">
        {list.data?.map((doc: any) => (
          <div key={doc.id} className="flex items-center justify-between border-b p-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{doc.title}</p>
                <p className="text-xs text-muted-foreground">{doc.category}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => openDoc(doc.file_path)}><Eye className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => remove.mutate(doc)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
