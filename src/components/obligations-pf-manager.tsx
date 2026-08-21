import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  CalendarClock,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  User,
  Mail,
  Globe,
  KeyRound,
} from "lucide-react";
import { LoadingState, ErrorState, EmptyState } from "@/components/query-states";
import {
  currencyBRL,
  obligationKindLabel,
  obligationStatusLabel,
  periodicityLabel,
} from "@/lib/format";

const PF_KINDS = [
  "irpf",
  "itr",
  "inss",
  "certificado_digital",
  "taxa",
  "servico",
  "taxa_municipal",
  "taxa_estadual",
  "taxa_federal",
  "seguro",
  "financiamento",
  "outro_pf",
  "outro",
];

type PfForm = {
  id?: string;
  kind: string;
  label: string;
  supplier: string;
  periodicity: string;
  due_date: string;
  amount: string;
  status: string;
  document_url: string;
  notes: string;
  property_id: string;
  category_ids: string[];
  create_task: boolean;
  credential_id: string | null;
  // Credential sub-form
  access_mode: "none" | "existing" | "new";
  cred_service: string;
  cred_website: string;
  cred_login: string;
  cred_password: string;
  cred_recovery_email: string;
  cred_reusable: boolean;
};

const emptyForm: PfForm = {
  kind: "irpf",
  label: "",
  supplier: "",
  periodicity: "anual",
  due_date: "",
  amount: "",
  status: "em_dia",
  document_url: "",
  notes: "",
  property_id: "none",
  category_ids: [],
  create_task: false,
  credential_id: null,
  access_mode: "none",
  cred_service: "",
  cred_website: "",
  cred_login: "",
  cred_password: "",
  cred_recovery_email: "",
  cred_reusable: true,
};

export function ObligationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PfForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const saveCredential = useServerFn(savePropertyCredential);
  const revealCredential = useServerFn(revealPropertyCredential);

  const credentials = useQuery({
    queryKey: ["credentials-lookup"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("property_credentials")
        .select("id, service, login, recovery_email, website, access_link")
        .order("service");
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Falha ao copiar");
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

  const list = useQuery({
    queryKey: ["obligations-pf"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("property_obligations")
        .select("*, property_credentials(login, recovery_email, service)")
        .eq("is_personal", true)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;

      const ids = (data ?? []).map((o: any) => o.id);
      let links: any[] = [];
      if (ids.length) {
        const { data: linkData, error: linkError } = await sb
          .from("property_obligation_categories")
          .select("obligation_id, category_id, categories(name)")
          .in("obligation_id", ids);
        if (linkError) throw linkError;
        links = linkData ?? [];
      }

      return (data ?? []).map((o: any) => ({
        ...o,
        categories: links.filter((l) => l.obligation_id === o.id),
      }));
    },
  });

  const properties = useQuery({
    queryKey: ["all-properties-lookup"],
    queryFn: async () => {
      const { data } = await sb.from("properties").select("id, name").order("name");
      return data ?? [];
    },
  });

  const categories = useQuery({
    queryKey: ["categories-lookup"],
    queryFn: async () => {
      const { data } = await sb
        .from("categories")
        .select("id, name")
        .eq("archived", false)
        .order("name");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await sb.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Não autenticado");

      let finalCredentialId = form.credential_id;

      // Handle New Credential creation
      if (form.access_mode === "new" && form.cred_password) {
        const credRes = await saveCredential({
          data: {
            service: form.cred_service || form.label || obligationKindLabel[form.kind] || "Obrigação PF",
            website: form.cred_website || null,
            login: form.cred_login || null,
            recovery_email: form.cred_recovery_email || null,
            password: form.cred_password,
            property_id: form.property_id === "none" ? "00000000-0000-0000-0000-000000000000" : form.property_id,
            property_ids: form.property_id === "none" ? [] : [form.property_id],
            notes: `Criado via Obrigação PF: ${form.label || form.kind}`,
          },
        });
        finalCredentialId = credRes.id;
      }

      const payload: any = {
        user_id: userId,
        is_personal: true,
        property_id: form.property_id === "none" ? null : form.property_id,
        kind: form.kind,
        label: form.label || null,
        supplier: form.supplier || null,
        periodicity: form.periodicity || null,
        due_date: form.due_date || null,
        amount: form.amount ? Number(form.amount.replace(/\./g, "").replace(",", ".")) : null,
        status: form.status,
        document_url: form.document_url || null,
        notes: form.notes || null,
        credential_id: finalCredentialId,
      };

      let obligationId = form.id;
      if (form.id) {
        const { error } = await sb.from("property_obligations").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb
          .from("property_obligations")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        obligationId = data.id;
      }

      if (obligationId) {
        await sb.from("property_obligation_categories").delete().eq("obligation_id", obligationId);
        if (form.category_ids.length) {
          const { error } = await sb.from("property_obligation_categories").insert(
            form.category_ids.map((category_id) => ({
              obligation_id: obligationId as string,
              category_id,
            })),
          );
          if (error) throw error;
        }
      }

      if (form.create_task && obligationId) {
        const { error } = await sb.from("property_tasks").insert({
          user_id: userId,
          property_id: form.property_id === "none" ? null : form.property_id,
          title: `Vencimento: ${form.label || obligationKindLabel[form.kind] || "Obrigação PF"}`,
          description: form.supplier ? `Órgão/Fornecedor: ${form.supplier}` : null,
          due_date: form.due_date || null,
          priority: "media",
          status: "pendente",
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Obrigação salva");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["obligations-pf"] });
      qc.invalidateQueries({ queryKey: ["tasks-all"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar obrigação"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("property_obligations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obrigação excluída");
      qc.invalidateQueries({ queryKey: ["obligations-pf"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  const openEdit = (o: any) => {
    setForm({
      id: o.id,
      kind: o.kind ?? "irpf",
      label: o.label ?? "",
      supplier: o.supplier ?? "",
      periodicity: o.periodicity ?? "anual",
      due_date: o.due_date ?? "",
      amount: o.amount != null ? String(o.amount).replace(".", ",") : "",
      status: o.status ?? "em_dia",
      document_url: o.document_url ?? "",
      notes: o.notes ?? "",
      property_id: o.property_id ?? "none",
      category_ids: (o.categories ?? []).map((c: any) => c.category_id),
      create_task: false,
      credential_id: o.credential_id || null,
      access_mode: o.credential_id ? "existing" : "none",
      cred_service: "",
      cred_website: "",
      cred_login: "",
      cred_password: "",
      cred_recovery_email: "",
      cred_reusable: true,
    });
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return (list.data ?? []).filter((o: any) => {
      const matchesTerm =
        !term ||
        o.label?.toLowerCase().includes(term) ||
        o.supplier?.toLowerCase().includes(term) ||
        o.notes?.toLowerCase().includes(term) ||
        (obligationKindLabel[o.kind] ?? "").toLowerCase().includes(term);
      const matchesKind = kindFilter === "all" || o.kind === kindFilter;
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      return matchesTerm && matchesKind && matchesStatus;
    });
  }, [list.data, search, kindFilter, statusFilter]);

  if (list.isLoading) return <LoadingState label="Carregando obrigações pessoais…" />;
  if (list.isError) return <ErrorState error={list.error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Obrigações PF</h1>
        <p className="text-sm text-muted-foreground">
          Centralize IRPF, ITR, INSS, certificados e demais obrigações pessoais.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por rótulo, órgão ou notas…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {PF_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {obligationKindLabel[k] ?? k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Todas as situações" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              {Object.entries(obligationStatusLabel).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setForm(emptyForm);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="premium">
              <Plus className="mr-2 h-4 w-4" /> Nova obrigação PF
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[calc(100dvh-32px)] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="flex-shrink-0 border-b p-6">
              <DialogTitle className="flex items-center gap-2">
                {form.id ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {form.id ? "Editar obrigação PF" : "Nova obrigação PF"}
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <form
                id="obligation-pf-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (save.isPending) return;
                  save.mutate();
                }}
                className="grid gap-4 sm:grid-cols-2"
              >
                <div className="space-y-2">
                  <Label>Tipo da obrigação *</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PF_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {obligationKindLabel[k] ?? k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rótulo (identificação)</Label>
                  <Input
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Ex.: IRPF 2026"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Órgão / Fornecedor</Label>
                  <Input
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    placeholder="Ex.: Receita Federal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Imóvel vinculado (opcional)</Label>
                  <Select
                    value={form.property_id}
                    onValueChange={(v) => setForm({ ...form, property_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {properties.data?.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Periodicidade</Label>
                  <Select
                    value={form.periodicity}
                    onValueChange={(v) => setForm({ ...form, periodicity: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(periodicityLabel).map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor estimado (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Situação atual</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(obligationStatusLabel).map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/20 p-4 sm:col-span-2">
                  <Label>Categorias financeiras</Label>
                  <p className="text-xs text-muted-foreground">
                    Selecione uma ou mais categorias para classificar esta obrigação.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {categories.data?.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`cat-${c.id}`}
                          checked={form.category_ids.includes(c.id)}
                          onCheckedChange={(checked) =>
                            setForm({
                              ...form,
                              category_ids: checked
                                ? [...form.category_ids, c.id]
                                : form.category_ids.filter((id) => id !== c.id),
                            })
                          }
                        />
                        <Label htmlFor={`cat-${c.id}`} className="cursor-pointer text-xs font-medium">
                          {c.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {!form.id && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Checkbox
                      id="pf_create_task"
                      checked={form.create_task}
                      onCheckedChange={(c) => setForm({ ...form, create_task: !!c })}
                    />
                    <Label htmlFor="pf_create_task" className="cursor-pointer text-sm">
                      Criar lembrete automático na área global de tarefas
                    </Label>
                  </div>
                )}

                <div className="space-y-2 sm:col-span-2">
                  <Label>URL / Link do documento</Label>
                  <Input
                    value={form.document_url}
                    onChange={(e) => setForm({ ...form, document_url: e.target.value })}
                    placeholder="https://…"
                  />
                </div>

                <div className="sm:col-span-2 mt-4 space-y-4 rounded-lg border bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-primary" />
                    <Label className="text-base font-semibold">Dados de Acesso</Label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div
                      className={`flex flex-col gap-2 p-3 rounded-md border cursor-pointer transition-colors ${
                        form.access_mode === "existing"
                          ? "bg-primary/10 border-primary"
                          : "bg-white hover:bg-slate-50"
                      }`}
                      onClick={() => setForm({ ...form, access_mode: "existing" })}
                    >
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        <span className="text-sm font-medium">Usar acesso existente</span>
                      </div>
                    </div>

                    <div
                      className={`flex flex-col gap-2 p-3 rounded-md border cursor-pointer transition-colors ${
                        form.access_mode === "new"
                          ? "bg-primary/10 border-primary"
                          : "bg-white hover:bg-slate-50"
                      }`}
                      onClick={() => setForm({ ...form, access_mode: "new" })}
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        <span className="text-sm font-medium">Cadastrar novo acesso</span>
                      </div>
                    </div>
                  </div>

                  {form.access_mode === "existing" && (
                    <div className="space-y-2 pt-2">
                      <Label>Selecionar acesso já cadastrado</Label>
                      <Select
                        value={form.credential_id || ""}
                        onValueChange={(v) => {
                          const cred = credentials.data?.find((c) => c.id === v);
                          setForm({
                            ...form,
                            credential_id: v,
                            document_url: cred?.access_link || cred?.website || form.document_url,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pesquisar por nome, e-mail ou login..." />
                        </SelectTrigger>
                        <SelectContent>
                          {credentials.data?.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.service} ({c.login || c.recovery_email || "Sem login"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {form.access_mode === "new" && (
                    <div className="space-y-4 pt-2 grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>E-mail de acesso</Label>
                        <div className="flex gap-2">
                          <Input
                            value={form.cred_recovery_email}
                            onChange={(e) => setForm({ ...form, cred_recovery_email: e.target.value })}
                            placeholder="exemplo@email.com"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => copy("new_email", form.cred_recovery_email)}
                          >
                            {copied === "new_email" ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Usuário / Login</Label>
                        <div className="flex gap-2">
                          <Input
                            value={form.cred_login}
                            onChange={(e) => setForm({ ...form, cred_login: e.target.value })}
                            placeholder="usuario123"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => copy("new_login", form.cred_login)}
                          >
                            {copied === "new_login" ? <Check className="h-4 w-4" /> : <User className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Senha</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={revealed["new_pass"] ? "text" : "password"}
                              value={form.cred_password}
                              onChange={(e) => setForm({ ...form, cred_password: e.target.value })}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setRevealed((v) => ({ ...v, new_pass: v.new_pass ? "" : "true" }))}
                            >
                              {revealed["new_pass"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => copy("new_pass_copy", form.cred_password)}
                          >
                            {copied === "new_pass_copy" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <Checkbox
                          id="cred_reusable"
                          checked={form.cred_reusable}
                          onCheckedChange={(c) => setForm({ ...form, cred_reusable: !!c })}
                        />
                        <Label htmlFor="cred_reusable" className="cursor-pointer text-sm">
                          Permitir usar este acesso em outras Obrigações PF
                        </Label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Observações</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </form>
            </div>
            <div className="flex flex-shrink-0 justify-end gap-2 border-t bg-background p-6">
              <Button
                type="button"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                form="obligation-pf-form"
                type="submit"
                variant="premium"
                disabled={save.isPending}
              >
                {save.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma obrigação pessoal encontrada"
          description="Cadastre suas obrigações de pessoa física para acompanhar prazos e valores."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o: any) => (
            <Card key={o.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-slate-900">
                      {o.label || obligationKindLabel[o.kind] || o.kind}
                    </p>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                    {obligationKindLabel[o.kind] ?? o.kind}
                    {o.supplier ? ` · ${o.supplier}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  {o.document_url && (
                    <a href={o.document_url} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="h-4 w-4 text-slate-600" />
                      </Button>
                    </a>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(o)}>
                    <Pencil className="h-4 w-4 text-slate-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => remove.mutate(o.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {o.credential_id && (
                <div className="rounded-md bg-slate-50 p-2.5 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2 text-primary">
                    <Lock className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Dados de Acesso</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Login:</span>
                      <div className="flex items-center gap-1.5 font-mono text-slate-700">
                        <span className="truncate max-w-[120px]">
                          {o.property_credentials?.login || o.property_credentials?.recovery_email || "—"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 hover:bg-slate-200"
                          onClick={() => copy(o.id + "_l", o.property_credentials?.login || o.property_credentials?.recovery_email || "")}
                        >
                          {copied === o.id + "_l" ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Senha:</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-slate-700">
                          {revealed[o.credential_id] ?? "••••••••"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 hover:bg-slate-200"
                          disabled={revealing === o.credential_id}
                          onClick={() => toggleReveal(o.credential_id)}
                        >
                          {revealed[o.credential_id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 hover:bg-slate-200"
                          onClick={() => copyPassword(o.credential_id)}
                        >
                          {copied === o.credential_id + "_p" ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">
                  {obligationStatusLabel[o.status] ?? o.status ?? "—"}
                </Badge>
                {o.periodicity && (
                  <Badge variant="outline">{periodicityLabel[o.periodicity] ?? o.periodicity}</Badge>
                )}
                {(o.categories ?? []).map((c: any) => (
                  <Badge key={c.category_id} variant="outline">
                    {c.categories?.name ?? "Categoria"}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {o.due_date
                    ? new Date(`${o.due_date}T12:00:00`).toLocaleDateString("pt-BR")
                    : "Sem vencimento"}
                </span>
                <span className="font-semibold">
                  {o.amount != null ? currencyBRL(Number(o.amount)) : "—"}
                </span>
              </div>

              {o.notes && <p className="text-xs text-muted-foreground line-clamp-2">{o.notes}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
