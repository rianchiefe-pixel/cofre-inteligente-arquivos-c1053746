import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as sb } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { savePropertyCredential, revealPropertyCredential } from "@/lib/credentials.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Plus,
  Search,
  KeyRound,
  ExternalLink,
  Pencil,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Landmark,
  Globe,
  User,
  Mail,
  Repeat,
  Filter,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState, ErrorState, EmptyState } from "@/components/query-states";

type CredForm = {
  id?: string;
  service: string;
  website: string;
  access_link: string;
  login: string;
  password: string;
  recovery_email: string;
  notes: string;
  property_ids: string[];
};

const emptyCred: CredForm = {
  service: "",
  website: "",
  access_link: "",
  login: "",
  password: "",
  recovery_email: "",
  notes: "",
  property_ids: [],
};

const CRED_COLUMNS = "id, service, website, access_link, login, recovery_email, notes, password_set_at, created_at, user_id";

export function AccessesManager() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CredForm>(emptyCred);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");

  const saveCredential = useServerFn(savePropertyCredential);
  const revealCredential = useServerFn(revealPropertyCredential);

  const list = useQuery({
    queryKey: ["credentials-all"],
    queryFn: async () => {
      // Busca todas as credenciais do usuário
      const { data, error } = await sb
        .from("property_credentials")
        .select(CRED_COLUMNS)
        .order("service");
      if (error) throw error;

      // Busca os vínculos para cada credencial
      const { data: links, error: linkError } = await sb
        .from("property_credential_links")
        .select("credential_id, property_id, properties(name)");
      if (linkError) throw linkError;

      return (data || []).map((c: any) => ({
        ...c,
        links: (links || []).filter((l) => l.credential_id === c.id),
      }));
    },
  });

  const allProperties = useQuery({
    queryKey: ["all-properties-lookup"],
    queryFn: async () => {
      const { data } = await sb.from("properties").select("id, name");
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await sb.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      return await saveCredential({
        data: {
          id: form.id ?? null,
          property_id: form.property_ids[0] || "00000000-0000-0000-0000-000000000000", // Fallback se não tiver imóvel
          property_ids: form.property_ids,
          service: form.service,
          website: form.website || null,
          access_link: form.access_link || null,
          login: form.login || null,
          recovery_email: form.recovery_email || null,
          notes: form.notes || null,
          password: form.id ? (form.password ? form.password : null) : form.password || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Acesso salvo");
      setOpen(false);
      setForm(emptyCred);
      setRevealed({});
      qc.invalidateQueries({ queryKey: ["credentials-all"] });
      qc.invalidateQueries({ queryKey: ["credentials"] }); // Invalida as queries por imóvel também
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("property_credentials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso excluído");
      qc.invalidateQueries({ queryKey: ["credentials-all"] });
      qc.invalidateQueries({ queryKey: ["credentials"] });
    },
  });

  const filteredData = useMemo(() => {
    if (!list.data) return [];
    return list.data.filter((c: any) => {
      const matchesSearch =
        c.service?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.login?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.notes?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesProperty = 
        propertyFilter === "all" || 
        c.links.some((l: any) => l.property_id === propertyFilter);

      return matchesSearch && matchesProperty;
    });
  }, [list.data, searchTerm, propertyFilter]);

  const openEdit = (c: any) => {
    const linkedIds = (c.links || []).map((l: any) => l.property_id);
    setForm({
      id: c.id,
      service: c.service ?? "",
      website: c.website ?? "",
      access_link: c.access_link ?? "",
      login: c.login ?? "",
      password: "",
      recovery_email: c.recovery_email ?? "",
      notes: c.notes ?? "",
      property_ids: linkedIds,
    });
    setOpen(true);
  };

  const toggleReveal = async (id: string) => {
    if (revealed[id]) {
      setRevealed((v) => {
        const next = { ...v };
        delete next[id];
        return next;
      });
      return;
    }
    setRevealing(id);
    try {
      const res = await revealCredential({ data: { id } });
      if (!res.password) {
        toast.error("Senha não cadastrada");
        return;
      }
      setRevealed((v) => ({ ...v, [id]: res.password! }));
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao revelar senha");
    } finally {
      setRevealing(null);
    }
  };

  const copyPassword = async (id: string) => {
    let value = revealed[id];
    if (!value) {
      try {
        const res = await revealCredential({ data: { id } });
        if (!res.password) {
          toast.error("Senha não cadastrada");
          return;
        }
        value = res.password;
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao copiar senha");
        return;
      }
    }
    await copy(id + "_p", value);
  };

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  if (list.isLoading) return <LoadingState label="Carregando acessos..." />;
  if (list.isError) return <ErrorState error={list.error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por serviço, login ou notas..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={propertyFilter} onValueChange={setPropertyFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todos os imóveis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os imóveis</SelectItem>
                {allProperties.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyCred); }}>
          <DialogTrigger asChild>
            <Button variant="premium">
              <Plus className="mr-2 h-4 w-4" /> Novo acesso
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[calc(100dvh-32px)] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-0 flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                {form.id ? "Editar acesso" : "Novo acesso às credenciais"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <div className="p-6">
                <form
                  id="credential-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (save.isPending) return;
                    save.mutate();
                  }}
                  className="space-y-6"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Serviço ou fornecedor *</Label>
                      <div className="relative">
                        <Landmark className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          required
                          className="pl-9"
                          value={form.service}
                          onChange={(e) => setForm({ ...form, service: e.target.value })}
                          placeholder="Ex.: Neoenergia, Embasa, Prefeitura"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Link de acesso (URL)</Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          value={form.access_link}
                          onChange={(e) => setForm({ ...form, access_link: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Site principal</Label>
                      <Input
                        value={form.website}
                        onChange={(e) => setForm({ ...form, website: e.target.value })}
                        placeholder="exemplo.com.br"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Usuário / Login</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          value={form.login}
                          onChange={(e) => setForm({ ...form, login: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Senha</Label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="password"
                          className="pl-9"
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          autoComplete="new-password"
                          placeholder={form.id ? "•••••••• (deixe vazio p/ manter)" : ""}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label>E-mail de recuperação</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          type="email"
                          value={form.recovery_email}
                          onChange={(e) => setForm({ ...form, recovery_email: e.target.value })}
                        />
                      </div>
                    </div>

                  <div className="space-y-2 sm:col-span-2 p-4 border rounded-lg bg-muted/20">
                    <Label className="flex items-center gap-2 mb-3">
                      <Repeat className="h-4 w-4 text-primary" />
                      Imóveis Vinculados
                    </Label>
                    <p className="text-xs text-muted-foreground mb-4">
                      Selecione quais imóveis utilizam esta mesma credencial.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {allProperties.data?.map((p) => (
                        <div key={p.id} className="flex items-center space-x-2 py-1">
                          <Checkbox
                            id={`prop-${p.id}`}
                            checked={form.property_ids.includes(p.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setForm({ ...form, property_ids: [...form.property_ids, p.id] });
                              } else {
                                setForm({
                                  ...form,
                                  property_ids: form.property_ids.filter((id) => id !== p.id),
                                });
                              }
                            }}
                          />
                          <Label 
                            htmlFor={`prop-${p.id}`} 
                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {p.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label>Observações sobre o acesso</Label>
                      <Textarea
                        rows={2}
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      />
                    </div>
                  </div>
                </form>
              </div>
            </div>
                <div className="flex justify-end gap-2 pt-4 border-t bg-background pb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={save.isPending}
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" variant="premium" disabled={save.isPending}>
                    {save.isPending ? "Salvando..." : "Salvar Acesso"}
                  </Button>
                </div>
              </form>
            </div>
            <div className="flex justify-end gap-2 p-6 border-t bg-background flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                form="credential-form"
                type="submit" 
                variant="premium" 
                disabled={save.isPending}
              >
                {save.isPending ? "Salvando..." : "Salvar Acesso"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {filteredData.length === 0 ? (
        <EmptyState
          title="Nenhum acesso encontrado"
          description="Experimente ajustar os filtros ou cadastrar um novo acesso."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredData.map((c: any) => (
            <div key={c.id} className="rounded-xl border border-border/60 bg-muted/30 p-4 flex flex-col">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.service}</p>
                  {c.website && <p className="truncate text-xs text-muted-foreground">{c.website}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {c.access_link && (
                    <a
                      href={c.access_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground p-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir acesso?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Essa ação excluirá a credencial e todos os seus vínculos com imóveis. Não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => remove.mutate(c.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div className="space-y-2 mt-auto">
                {c.login && (
                  <div className="grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Login</span>
                    <span className="truncate font-mono">{c.login}</span>
                    <Button size="sm" variant="ghost" onClick={() => copy(c.id + "_l", c.login)}>
                      {copied === c.id + "_l" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-[80px_minmax(0,1fr)_auto_auto] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Senha</span>
                  <span className="truncate font-mono">{revealed[c.id] ?? "••••••••"}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revealing === c.id}
                    onClick={() => toggleReveal(c.id)}
                  >
                    {revealed[c.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => copyPassword(c.id)}>
                    {copied === c.id + "_p" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>

                {c.links && c.links.length > 0 && (
                  <div className="pt-2 border-t border-border/40">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      Imóveis Vinculados
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {c.links.map((l: any) => (
                        <Badge key={l.property_id} variant="secondary" className="text-[10px] py-0 px-2">
                          {l.properties?.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
