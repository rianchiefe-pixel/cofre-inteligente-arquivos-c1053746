import { useRef, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, StickyNote, Paperclip, Eye, Pencil, Trash2, Download, FileText, Loader2, X, Home } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { annotationsQuery, saveAnnotation, deleteAnnotation } from "@/lib/annotations.functions";
import { annotationPath, annotationSchema, type AnnotationFile, type AnnotationInput } from "@/lib/annotations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Note = Awaited<ReturnType<typeof import("@/lib/annotations.functions").listAnnotations>>["notes"][number];
type Filters = { q: string; property: string; type: string; from: string; until: string };
const blank = (): AnnotationInput => ({ id: crypto.randomUUID(), title: "", description: "", body: "", note_date: "", property_id: "", files: [] });
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const dateLabel = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
const noteTitle = (note: Note) => note.title || note.description || note.body.split("\n")[0] || note.annotation_attachments[0]?.file_name || "Anotação";

export function AnnotationsManager({ filters, onFilters }: { filters: Filters; onFilters: (next: Partial<Filters>) => void }) {
  const { data } = useSuspenseQuery(annotationsQuery);
  const qc = useQueryClient();
  const save = useServerFn(saveAnnotation);
  const remove = useServerFn(deleteAnnotation);
  const [form, setForm] = useState<AnnotationInput | null>(null);
  const [originalFiles, setOriginalFiles] = useState<AnnotationFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ file: AnnotationFile; url: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const liveSelected = data.notes.find((n) => n.id === selected?.id) ?? selected;
  const filtered = data.notes.filter((note) => {
    const text = [note.title, note.body, note.description, ...note.annotation_attachments.map((f) => f.file_name)].join(" ").toLocaleLowerCase("pt-BR");
    if (filters.q && !text.includes(filters.q.toLocaleLowerCase("pt-BR"))) return false;
    if (filters.property === "none" && note.property_id) return false;
    if (filters.property !== "all" && filters.property !== "none" && note.property_id !== filters.property) return false;
    if (filters.type === "text" && !note.body && !note.description && !note.title) return false;
    if (filters.type === "files" && !note.annotation_attachments.length) return false;
    if (filters.type === "images" && !note.annotation_attachments.some((f) => f.mime_type.startsWith("image/"))) return false;
    const date = note.note_date ?? note.created_at.slice(0, 10);
    return (!filters.from || date >= filters.from) && (!filters.until || date <= filters.until);
  });
  const edit = (note?: Note) => {
    const files = note?.annotation_attachments.map(({ file_path, file_name, mime_type, size_bytes }) => ({ file_path, file_name, mime_type, size_bytes })) ?? [];
    setForm(note ? { id: note.id, title: note.title, description: note.description, body: note.body, note_date: note.note_date ?? "", property_id: note.property_id ?? "", files } : blank());
    setOriginalFiles(files); setPendingFiles([]); setSelected(null);
  };
  const update = (patch: Partial<AnnotationInput>) => setForm((prev) => prev ? { ...prev, ...patch } : prev);
  const submit = async () => {
    if (!form || busy) return;
    const temporaryFiles = pendingFiles.map((f) => ({ file_path: "pending", file_name: f.name, mime_type: f.type || "application/octet-stream", size_bytes: f.size }));
    const valid = annotationSchema.safeParse({ ...form, files: [...form.files, ...temporaryFiles] });
    if (!valid.success) { toast.error(valid.error.issues[0]?.message ?? "Confira os campos."); return; }
    setBusy(true);
    const uploaded: AnnotationFile[] = [];
    let saved = false;
    try {
      for (const file of pendingFiles) {
        const path = annotationPath(data.userId, form.id, file.name);
        const { error } = await supabase.storage.from("notes-attachments").upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (error) throw error;
        uploaded.push({ file_path: path, file_name: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size });
      }
      await save({ data: { ...form, files: [...form.files, ...uploaded] } });
      saved = true;
      const removedPaths = originalFiles.filter((f) => !form.files.some((kept) => kept.file_path === f.file_path)).map((f) => f.file_path);
      if (removedPaths.length) {
        const { error } = await supabase.storage.from("notes-attachments").remove(removedPaths);
        if (error) toast.warning("Anotação salva; não foi possível limpar os anexos removidos.");
      }
      setForm(null); setPendingFiles([]);
      await qc.invalidateQueries({ queryKey: ["annotations"] });
      toast.success("Anotação salva.");
    } catch (error) {
      if (!saved && uploaded.length) await supabase.storage.from("notes-attachments").remove(uploaded.map((f) => f.file_path));
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a anotação.");
    } finally { setBusy(false); }
  };
  const openFile = async (file: AnnotationFile) => {
    setPreviewBusy(file.file_path);
    try {
      const { data: result, error } = await supabase.storage.from("notes-attachments").createSignedUrl(file.file_path, 300);
      if (error) throw error;
      setPreview({ file, url: result.signedUrl });
    } catch { toast.error("Não foi possível visualizar o arquivo."); }
    finally { setPreviewBusy(null); }
  };
  const download = async (file: AnnotationFile) => {
    try {
      const { data: blob, error } = await supabase.storage.from("notes-attachments").download(file.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = file.file_name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error("Não foi possível baixar o arquivo."); }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await remove({ data: { id: deleting.id } }); setDeleting(null); setSelected(null);
      await qc.invalidateQueries({ queryKey: ["annotations"] }); toast.success("Anotação excluída.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir."); }
    finally { setBusy(false); }
  };
  const attachmentRow = (file: AnnotationFile) => (
    <div key={file.file_path} className="flex min-w-0 items-center gap-3 rounded-md border border-border p-3">
      <FileText className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{file.file_name}</p><p className="text-xs text-muted-foreground">{size(file.size_bytes)}</p></div>
      <Button size="icon" variant="ghost" title="Visualizar arquivo" aria-label={`Visualizar ${file.file_name}`} onClick={() => openFile(file)} disabled={previewBusy === file.file_path}><Eye /></Button>
      <Button size="icon" variant="ghost" title="Baixar arquivo" aria-label={`Baixar ${file.file_name}`} onClick={() => download(file)}><Download /></Button>
    </div>
  );
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">Anotações</h1><Button variant="premium" onClick={() => edit()}><Plus /> Nova anotação</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar anotações" className="pl-9" placeholder="Buscar anotações e arquivos" value={filters.q} onChange={(e) => onFilters({ q: e.target.value })} /></div>
      <Select value={filters.property} onValueChange={(property) => onFilters({ property })}><SelectTrigger aria-label="Filtrar por imóvel"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os imóveis</SelectItem><SelectItem value="none">Sem vínculo com imóvel</SelectItem>{data.properties.filter((p) => p.status !== "vendido" || data.notes.some((n) => n.property_id === p.id)).map((p) => <SelectItem value={p.id} key={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
      <Select value={filters.type} onValueChange={(type) => onFilters({ type })}><SelectTrigger aria-label="Filtrar por conteúdo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os conteúdos</SelectItem><SelectItem value="text">Com texto</SelectItem><SelectItem value="files">Com anexos</SelectItem><SelectItem value="images">Com imagens</SelectItem></SelectContent></Select>
      <div><Label htmlFor="notes-from" className="text-xs text-muted-foreground">Data inicial</Label><Input id="notes-from" type="date" value={filters.from} onChange={(e) => onFilters({ from: e.target.value })} /></div>
      <div><Label htmlFor="notes-until" className="text-xs text-muted-foreground">Data final</Label><Input id="notes-until" type="date" value={filters.until} onChange={(e) => onFilters({ until: e.target.value })} /></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{filtered.length} {filtered.length === 1 ? "anotação" : "anotações"}</span>{(filters.q || filters.property !== "all" || filters.type !== "all" || filters.from || filters.until) && <Button variant="ghost" size="sm" onClick={() => onFilters({ q: "", property: "all", type: "all", from: "", until: "" })}><X /> Limpar filtros</Button>}</div>
    {filtered.length === 0 ? <div className="grid justify-items-center gap-3 border-y border-border py-16 text-center"><StickyNote className="h-10 w-10 text-muted-foreground" /><p className="font-medium">{data.notes.length ? "Nenhuma anotação encontrada." : "Nenhuma anotação salva."}</p><Button variant="outline" onClick={() => edit()}><Plus /> Nova anotação</Button></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((note) => <Card key={note.id} className="flex min-w-0 flex-col gap-4 p-5">
      <div className="flex items-start gap-3"><StickyNote className="mt-1 h-5 w-5 shrink-0 text-primary" /><h2 className="min-w-0 flex-1 line-clamp-2 break-words font-semibold">{noteTitle(note)}</h2></div>
      {note.description && <p className="line-clamp-2 break-words text-sm text-muted-foreground">{note.description}</p>}{note.body && <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm">{note.body}</p>}
      <div className="mt-auto space-y-2 text-xs text-muted-foreground"><p>{dateLabel(note.note_date ?? note.created_at)}</p>{note.property_id && <p className="flex items-center gap-1"><Home className="h-3 w-3 shrink-0" /><span className="truncate">{data.properties.find((p) => p.id === note.property_id)?.name ?? "Imóvel"}</span></p>}{note.annotation_attachments.length > 0 && <p className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{note.annotation_attachments.length} anexo(s)</p>}</div>
      <div className="flex items-center justify-between border-t border-border pt-3"><Button variant="ghost" size="sm" onClick={() => setSelected(note)}><Eye /> Visualizar</Button><div className="flex"><Button size="icon" variant="ghost" title="Editar anotação" aria-label={`Editar ${noteTitle(note)}`} onClick={() => edit(note)}><Pencil /></Button><Button size="icon" variant="ghost" className="text-destructive" title="Excluir anotação" aria-label={`Excluir ${noteTitle(note)}`} onClick={() => setDeleting(note)}><Trash2 /></Button></div></div>
    </Card>)}</div>}
    <Dialog open={Boolean(form)} onOpenChange={(open) => { if (!open && !busy) setForm(null); }}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{data.notes.some((n) => n.id === form?.id) ? "Editar anotação" : "Nova anotação"}</DialogTitle><DialogDescription className="sr-only">Texto e anexos da anotação</DialogDescription></DialogHeader>{form && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="space-y-2"><Label htmlFor="note-title">Título (opcional)</Label><Input id="note-title" value={form.title} onChange={(e) => update({ title: e.target.value })} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="note-description">Descrição (opcional)</Label><Input id="note-description" value={form.description} onChange={(e) => update({ description: e.target.value })} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="note-body">Texto livre (opcional)</Label><Textarea id="note-body" rows={7} value={form.body} onChange={(e) => update({ body: e.target.value })} disabled={busy} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="note-date">Data (opcional)</Label><Input id="note-date" type="date" value={form.note_date} onChange={(e) => update({ note_date: e.target.value })} disabled={busy} /></div><div className="space-y-2"><Label>Imóvel (opcional)</Label><Select value={form.property_id || "none"} onValueChange={(id) => update({ property_id: id === "none" ? "" : id })} disabled={busy}><SelectTrigger aria-label="Imóvel da anotação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem vínculo com imóvel</SelectItem>{data.properties.filter((p) => p.status !== "vendido" || p.id === form.property_id).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="space-y-2"><Label>Anexos</Label><Input ref={fileInput} type="file" multiple className="hidden" aria-label="Selecionar anexos" onChange={(e) => { setPendingFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} disabled={busy} /><Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}><Paperclip /> Adicionar arquivos</Button>
        {form.files.map((f) => <div key={f.file_path} className="flex items-center gap-2 rounded-md border p-2"><span className="min-w-0 flex-1 break-all text-sm">{f.file_name}</span><Button type="button" size="icon" variant="ghost" aria-label={`Remover ${f.file_name}`} title="Remover anexo" disabled={busy} onClick={() => update({ files: form.files.filter((x) => x.file_path !== f.file_path) })}><X /></Button></div>)}
        {pendingFiles.map((f, i) => <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border p-2"><span className="min-w-0 flex-1 break-all text-sm">{f.name} · {size(f.size)}</span><Button type="button" size="icon" variant="ghost" aria-label={`Remover ${f.name}`} title="Remover anexo" disabled={busy} onClick={() => setPendingFiles((prev) => prev.filter((_, index) => index !== i))}><X /></Button></div>)}
      </div><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{busy ? "Salvando…" : "Salvar anotação"}</Button></div>
    </form>}</DialogContent></Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="break-words pr-5">{liveSelected && noteTitle(liveSelected)}</DialogTitle><DialogDescription>{liveSelected && dateLabel(liveSelected.note_date ?? liveSelected.created_at)}</DialogDescription></DialogHeader>{liveSelected && <><p className="whitespace-pre-wrap break-words text-muted-foreground">{liveSelected.description}</p><p className="whitespace-pre-wrap break-words">{liveSelected.body}</p>{liveSelected.property_id && <p className="text-sm text-muted-foreground">Imóvel: {data.properties.find((p) => p.id === liveSelected.property_id)?.name}</p>}<div className="space-y-2">{liveSelected.annotation_attachments.map(attachmentRow)}</div><div className="flex justify-end"><Button variant="outline" onClick={() => edit(liveSelected)}><Pencil /> Editar</Button></div></>}</DialogContent></Dialog>
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle className="break-all pr-5">{preview?.file.file_name}</DialogTitle><DialogDescription className="sr-only">Visualização do arquivo anexado</DialogDescription></DialogHeader>{preview && <>{preview.file.mime_type.startsWith("image/") ? <img src={preview.url} alt={preview.file.file_name} className="max-h-[65dvh] w-full object-contain" /> : preview.file.mime_type === "application/pdf" || preview.file.file_name.toLowerCase().endsWith(".pdf") ? <iframe title={preview.file.file_name} src={preview.url} className="h-[65dvh] w-full rounded-md border" /> : <div className="grid justify-items-center gap-3 py-12"><FileText className="h-12 w-12 text-primary" /><p className="break-all text-center text-sm">{preview.file.file_name}</p><p className="text-xs text-muted-foreground">{size(preview.file.size_bytes)}</p></div>}<div className="flex justify-end"><Button onClick={() => download(preview.file)}><Download /> Baixar arquivo</Button></div></>}</DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><DialogContent className="w-[calc(100%-2rem)]"><DialogHeader><DialogTitle>Excluir anotação?</DialogTitle><DialogDescription>A anotação e seus anexos serão excluídos permanentemente. Os demais cadastros não serão alterados.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>Cancelar</Button><Button variant="destructive" onClick={confirmDelete} disabled={busy}>{busy ? "Excluindo…" : "Excluir anotação"}</Button></div></DialogContent></Dialog>
  </div>;
}