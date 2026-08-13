/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { currencyBRL, dateBR, paymentMethodLabel, transactionTypeLabel } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  GitCompareArrows,
  Inbox,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  XCircle,
} from "lucide-react";
import { ReceiptViewerPane, type PreviewState } from "./receipt-viewer";

type Lookup = { id: string; name: string };
type PropertyOption = Lookup & { profile_id?: string | null };
type AccountOption = {
  id: string;
  nickname: string;
  bank_id?: string | null;
  profile_id?: string | null;
};

export type ConferenceField =
  | "payment_date"
  | "amount"
  | "recipient_name"
  | "recipient_tax_id"
  | "bank_name"
  | "auth_code"
  | "payment_method"
  | "transaction_type"
  | "expense_behavior"
  | "category_id"
  | "description"
  | "notes"
  | "profile_id"
  | "property_id"
  | "bank_id"
  | "account_id";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SuggestionHint({ value, onApply }: { value: string; onApply: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
      <span>
        Sugestão do comprovante: <span className="font-medium text-foreground">{value}</span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs"
        onClick={onApply}
      >
        Usar sugestão
      </Button>
    </div>
  );
}

function NewCategoryPopover({
  defaultType,
  onCreate,
}: {
  defaultType: string | null;
  onCreate: (name: string, type: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState(defaultType ?? "gasto_variavel");
  const [saving, setSaving] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" /> Nova categoria
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Nome da categoria</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Manutenção predial"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo padrão</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(transactionTypeLabel).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              const id = await onCreate(name.trim(), type);
              setSaving(false);
              if (id) {
                setName("");
                setOpen(false);
              }
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar categoria
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ConferenceDialog(props: {
  original: any | null;
  draft: any | null;
  suggested: any | null;
  isDirty: boolean;
  busy: boolean;
  canApprove: boolean;
  preview: PreviewState;
  statusBadge: (status: string) => React.ReactNode;
  categories: Lookup[];
  profiles: Lookup[];
  properties: PropertyOption[];
  banks: Lookup[];
  accounts: AccountOption[];
  patchDraft: (patch: Partial<Record<ConferenceField, unknown>>) => void;
  applySuggestion: (field: ConferenceField) => void;
  onRequestClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onApprove: () => void;
  onReject: (note: string) => void;
  onArchive: () => void;

  onAnalyze: () => void;
  onCompare: () => void;
  onPreviewError: (message: string) => void;
  onCreateCategory: (name: string, type: string) => Promise<string | null>;
  hasExtractedData: boolean;
}) {
  const {
    original,
    draft,
    suggested,
    isDirty,
    busy,
    canApprove,
    preview,
    statusBadge,
    categories,
    profiles,
    properties,
    banks,
    accounts,
    patchDraft,
    applySuggestion,
    onRequestClose,
    onDiscard,
    onSave,
    onApprove,
    onReject,
    onArchive,

    onAnalyze,
    onCompare,
    onPreviewError,
    onCreateCategory,
    hasExtractedData,
  } = props;

  const [mobileTab, setMobileTab] = useState<"file" | "form">("file");
  const [rejectNote, setRejectNote] = useState("");

  const availableProperties = useMemo(() => {
    if (!draft?.profile_id) return properties;
    return properties.filter((p) => !p.profile_id || p.profile_id === draft.profile_id);
  }, [properties, draft?.profile_id]);

  const availableAccounts = useMemo(() => {
    let list = accounts;
    if (draft?.bank_id) list = list.filter((a) => a.bank_id === draft.bank_id);
    if (draft?.profile_id)
      list = list.filter((a) => !a.profile_id || a.profile_id === draft.profile_id);
    return list;
  }, [accounts, draft?.bank_id, draft?.profile_id]);

  const missing = useMemo(() => {
    if (!draft) return [] as string[];
    const out: string[] = [];
    if (!draft.payment_date) out.push("Data");
    if (draft.amount == null || Number(draft.amount) <= 0) out.push("Valor");
    if (!draft.recipient_name && !draft.description) out.push("Destinatário ou descrição");
    if (!draft.transaction_type) out.push("Tipo");
    if (!draft.category_id) out.push("Categoria");
    if (!draft.profile_id) out.push("Perfil financeiro");
    return out;
  }, [draft]);

  if (!original || !draft) {
    return (
      <Dialog open={false}>
        <DialogContent />
      </Dialog>
    );
  }

  const suggestionFor = (field: ConferenceField) => {
    const value = suggested?.[field];
    if (value == null || value === "") return null;
    if (String(value) === String(draft[field] ?? "")) return null;
    return value;
  };

  const dupScore = typeof original.duplicate_score === "number" ? original.duplicate_score : 0;
  const blockReason = isDirty
    ? "Salve ou descarte as alterações antes de aprovar."
    : missing.length
      ? `Preencha ${missing.join(", ")} antes de aprovar.`
      : null;

  const approveButton = (
    <Button
      variant="success"
      disabled={busy || isDirty || missing.length > 0}
      onClick={dupScore >= 50 ? undefined : onApprove}
    >
      <CheckCircle2 className="h-4 w-4" /> Aprovar lançamento
    </Button>
  );

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          if (busy) return;
          onRequestClose();
        }
      }}
    >
      <DialogContent
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          if (!busy) onRequestClose();
        }}
        onInteractOutside={(e) => e.preventDefault()}
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[94vh] sm:w-[96vw] sm:max-w-[1600px] sm:rounded-xl"
      >
        {/* ---------- Cabeçalho fixo ---------- */}
        <header className="shrink-0 border-b border-border bg-card px-4 py-3 sm:px-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold sm:text-lg">
                Conferência do comprovante
              </DialogTitle>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-muted-foreground">{original.file_name ?? "Arquivo sem nome"}</span>
                {original.ocr_data?.document_type && (
                  <Badge variant="outline" className="h-5 py-0 px-1.5 text-[10px] border-muted-foreground/30 capitalize">
                    {original.ocr_data.document_type.replace("_", " ")}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {currencyBRL(Number(draft.amount ?? 0))}
                </span>
                <span>•</span>
                <span>{dateBR(draft.payment_date)}</span>
                <span className="hidden sm:inline">•</span>
                <span className="flex items-center gap-1">
                  Status: {statusBadge(original.status)}
                </span>
                {isDirty && (
                  <Badge variant="outline" className="border-primary/50 text-primary">
                    Alterações não salvas
                  </Badge>
                )}
                {dupScore >= 50 && (
                  <button
                    type="button"
                    onClick={onCompare}
                    className={`flex items-center gap-1 rounded-md border px-2 py-0.5 ${dupScore >= 80 ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-yellow-500/50 bg-yellow-500/10 text-yellow-700"}`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {dupScore >= 80 ? "Alta chance de repetição" : "Possível duplicidade"} (
                    {dupScore}/100)
                    {original.duplicate_of ? <GitCompareArrows className="h-3 w-3" /> : null}
                  </button>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <span className="w-6" />
            </div>
          </div>

          {/* Abas — somente celular/tablet estreito */}
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab("file")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${mobileTab === "file" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Comprovante
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("form")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${mobileTab === "form" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Dados do lançamento
            </button>
          </div>
        </header>

        {/* ---------- Conteúdo: duas colunas com rolagem independente ---------- */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.75fr)]">
          <div
            className={`min-h-0 min-w-0 overflow-hidden ${mobileTab === "file" ? "flex" : "hidden"} lg:flex`}
          >
            <ReceiptViewerPane
              preview={preview}
              fileName={original.file_name}
              fileMime={original.file_mime}
              busy={busy}
              analyzeLabel={hasExtractedData ? "Reanalisar com IA" : "Analisar agora"}
              onAnalyze={onAnalyze}
              onPreviewError={onPreviewError}
            />
          </div>

          <div
            className={`min-h-0 min-w-0 flex-col overflow-y-auto bg-background px-4 py-4 pb-10 ${mobileTab === "form" ? "flex" : "hidden"} lg:flex`}
          >
            <div className="space-y-4">
              {original.ocr_status === "failed" && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-center gap-2 mb-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Falha na análise automática</h3>
                  </div>
                  <p className="text-sm font-medium leading-relaxed mb-3">
                    {original.ocr_error || "Ocorreu um erro ao processar este comprovante."}
                  </p>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={onAnalyze}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-2 h-3 w-3" />}
                    Tentar análise novamente
                  </Button>
                </div>
              )}

              {original.ai_confidence && original.ocr_status === "done" && (
                <div className={`rounded-xl border p-4 ${
                  original.ai_confidence === "ALTA" ? "border-success/30 bg-success/5" :
                  original.ai_confidence === "MEDIA" ? "border-yellow-500/30 bg-yellow-500/5" :
                  "border-muted bg-muted/20"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <GitCompareArrows className="h-3.5 w-3.5" /> Inteligência do Cofre
                    </h3>
                    <Badge variant={original.ai_confidence === "ALTA" ? "default" : original.ai_confidence === "MEDIA" ? "secondary" : "outline"} className={`text-[10px] h-5 px-1.5 ${original.ai_confidence === "ALTA" ? "bg-success text-success-foreground" : original.ai_confidence === "MEDIA" ? "bg-yellow-500 text-white" : ""}`}>
                      Confiança {original.ai_confidence}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{original.ai_reason}</p>
                  
                  {original.ai_history_summary && (
                    <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                      <span>• {original.ai_history_summary.count} ocorrências no histórico</span>
                      {original.ai_history_summary.avgAmount && (
                        <span>• Média de {currencyBRL(original.ai_history_summary.avgAmount)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}


              {isDirty && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
                  Você tem alterações não salvas. Clique em <strong>Salvar alterações</strong> para
                  gravar.
                </div>
              )}

              <Section title="Dados principais">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={draft.payment_date ?? ""}
                      onChange={(e) => patchDraft({ payment_date: e.target.value || null })}
                    />
                    {suggestionFor("payment_date") && (
                      <SuggestionHint
                        value={String(suggested.payment_date)}
                        onApply={() => applySuggestion("payment_date")}
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Valor</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={draft.amount ?? ""}
                      onChange={(e) =>
                        patchDraft({
                          amount: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                    {suggestionFor("amount") && (
                      <SuggestionHint
                        value={String(suggested.amount)}
                        onApply={() => applySuggestion("amount")}
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Destinatário</Label>
                  <Input
                    value={draft.recipient_name ?? ""}
                    onChange={(e) => patchDraft({ recipient_name: e.target.value || null })}
                  />
                  {suggestionFor("recipient_name") && (
                    <SuggestionHint
                      value={String(suggested.recipient_name)}
                      onApply={() => applySuggestion("recipient_name")}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>CPF/CNPJ do destinatário</Label>
                  <Input
                    value={draft.recipient_tax_id ?? ""}
                    onChange={(e) => patchDraft({ recipient_tax_id: e.target.value || null })}
                  />
                  {suggestionFor("recipient_tax_id") && (
                    <SuggestionHint
                      value={String(suggested.recipient_tax_id)}
                      onApply={() => applySuggestion("recipient_tax_id")}
                    />
                  )}
                </div>
              </Section>

              <Section title="Pagamento">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Forma de pagamento</Label>
                    <Select
                      value={draft.payment_method ?? undefined}
                      onValueChange={(v) => patchDraft({ payment_method: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(paymentMethodLabel).map(([v, l]) => (
                          <SelectItem key={v} value={v}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {suggestionFor("payment_method") && (
                      <SuggestionHint
                        value={
                          paymentMethodLabel[
                            suggested.payment_method as keyof typeof paymentMethodLabel
                          ] ?? String(suggested.payment_method)
                        }
                        onApply={() => applySuggestion("payment_method")}
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Código de autenticação</Label>
                    <Input
                      value={draft.auth_code ?? ""}
                      onChange={(e) => patchDraft({ auth_code: e.target.value || null })}
                    />
                    {suggestionFor("auth_code") && (
                      <SuggestionHint
                        value={String(suggested.auth_code)}
                        onApply={() => applySuggestion("auth_code")}
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Banco informado no comprovante</Label>
                  <Input
                    value={draft.bank_name ?? ""}
                    onChange={(e) => patchDraft({ bank_name: e.target.value || null })}
                  />
                  {suggestionFor("bank_name") && (
                    <SuggestionHint
                      value={String(suggested.bank_name)}
                      onApply={() => applySuggestion("bank_name")}
                    />
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Banco cadastrado no Meu Cofre</Label>
                    <Select
                      value={draft.bank_id ?? "none"}
                      onValueChange={(v) => {
                        const bankId = v === "none" ? null : v;
                        const keepAccount = accounts.find((a) => a.id === draft.account_id);
                        const compatible =
                          !keepAccount || !bankId || keepAccount.bank_id === bankId;
                        patchDraft({
                          bank_id: bankId,
                          ...(compatible ? {} : { account_id: null }),
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {banks.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Conta utilizada</Label>
                    <Select
                      value={draft.account_id ?? "none"}
                      onValueChange={(v) => patchDraft({ account_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhuma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {availableAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nickname}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableAccounts.length === 0 && (
                      <p className="pt-1 text-xs text-muted-foreground">
                        Nenhuma conta compatível com o banco e o perfil selecionados.
                      </p>
                    )}
                  </div>
                </div>
              </Section>

              <Section title="Classificação">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Natureza</Label>
                    <Select
                      value={draft.transaction_type ?? undefined}
                      onValueChange={(v) => patchDraft({ transaction_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="despesa">Despesa</SelectItem>
                        <SelectItem value="investimento">Investimento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo de Gasto</Label>
                    <Select
                      value={draft.expense_behavior ?? "none"}
                      onValueChange={(v) => patchDraft({ expense_behavior: v === "none" ? null : v })}
                      disabled={draft.transaction_type === "investimento"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Não definido</SelectItem>
                        <SelectItem value="fixed">Fixo</SelectItem>
                        <SelectItem value="variable">Variável</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Select
                        value={draft.category_id ?? undefined}
                        onValueChange={(v) => patchDraft({ category_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <NewCategoryPopover
                      defaultType={draft.transaction_type ?? null}
                      onCreate={onCreateCategory}
                    />
                  </div>
                  {suggestionFor("category_id") && (
                    <SuggestionHint
                      value={
                        categories.find((c) => c.id === suggested.category_id)?.name ??
                        "Categoria sugerida"
                      }
                      onApply={() => applySuggestion("category_id")}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Textarea
                    rows={3}
                    value={draft.description ?? ""}
                    onChange={(e) => patchDraft({ description: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Observações</Label>
                  <Textarea
                    rows={2}
                    value={draft.notes ?? ""}
                    onChange={(e) => patchDraft({ notes: e.target.value || null })}
                  />
                </div>
              </Section>

              <Section title="Vínculos do Meu Cofre">
                <div className="space-y-1">
                  <Label>Perfil financeiro</Label>
                  <Select
                    value={draft.profile_id ?? undefined}
                    onValueChange={(v) => {
                      const property = properties.find((p) => p.id === draft.property_id);
                      const keepProperty =
                        !property || !property.profile_id || property.profile_id === v;
                      patchDraft({ profile_id: v, ...(keepProperty ? {} : { property_id: null }) });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Imóvel vinculado</Label>
                  <Select
                    value={draft.property_id ?? "none"}
                    onValueChange={(v) => patchDraft({ property_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {availableProperties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {suggestionFor("property_id") && (
                    <SuggestionHint
                      value={
                        properties.find((p) => p.id === suggested.property_id)?.name ??
                        "Imóvel sugerido"
                      }
                      onApply={() => applySuggestion("property_id")}
                    />
                  )}
                </div>
              </Section>
            </div>
          </div>
        </div>

        {/* ---------- Rodapé fixo ---------- */}
        <footer className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-5">
          {blockReason && <p className="mb-2 text-xs text-muted-foreground">{blockReason}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={onArchive} disabled={busy}>
                <Inbox className="h-4 w-4" /> Conferir depois
              </Button>

              {canApprove && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={busy || isDirty}>
                      <XCircle className="h-4 w-4" /> Rejeitar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rejeitar este comprovante?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Ele não entrará no dashboard nem nos relatórios.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 py-2">
                      <Label>Motivo da rejeição</Label>
                      <Textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Descreva o motivo, se necessário"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onReject(rejectNote)}>
                        Confirmar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy || !isDirty}>
                <RotateCcw className="h-4 w-4" /> Descartar alterações
              </Button>
              <Button size="sm" onClick={onSave} disabled={busy || !isDirty}>
                <Save className="h-4 w-4" /> Salvar alterações
              </Button>
              {canApprove &&
                (dupScore >= 50 ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>{approveButton}</AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Possível duplicidade detectada</AlertDialogTitle>
                        <AlertDialogDescription>
                          Este comprovante parece semelhante a outro já salvo. Confirme somente se
                          revisou o arquivo, valor, data, destinatário, banco e código de
                          autenticação.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={onApprove}>
                          Aprovar mesmo assim
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  approveButton
                ))}
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
