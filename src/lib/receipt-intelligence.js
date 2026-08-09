/**
 * Normaliza nomes de favorecidos para comparação robusta.
 * Remove acentos, pontuação, termos empresariais comuns e espaços extras.
 */
export function normalizePayeeName(name) {
    if (!name)
        return "";
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, " ")
        .replace(/\b(LTDA|ME|EPP|S\/A|SA|EIRELI|LIMITADA)\b/gi, "")
        .trim()
        .toLowerCase();
}
/**
 * Busca o histórico de transações de um favorecido para embasar a sugestão.
 * Restrito ao contexto do usuário e perfis acessíveis.
 */
export async function getPayeeHistory(params) {
    const { userId, payeeName, taxId, supabase } = params;
    const normalized = normalizePayeeName(payeeName);
    // Busca recibos aprovados do mesmo favorecido (por nome normalizado ou documento)
    let query = supabase
        .from("receipts")
        .select("id, amount, payment_date, category_id, profile_id, recipient_name, status")
        .eq("status", "approved");
    if (taxId) {
        query = query.or(`recipient_tax_id.eq.${taxId},recipient_name.ilike.%${payeeName}%`);
    }
    else {
        query = query.ilike("recipient_name", `%${payeeName}%`);
    }
    const { data, error } = await query.limit(50);
    if (error || !data)
        return null;
    // Filtragem adicional por nome normalizado se não houver taxId
    const history = data.filter((r) => {
        if (taxId && r.recipient_tax_id === taxId)
            return true;
        return normalizePayeeName(r.recipient_name) === normalized;
    });
    if (history.length === 0)
        return null;
    // Agrega estatísticas
    const categories = {};
    const profiles = {};
    const values = [];
    history.forEach((r) => {
        if (r.category_id)
            categories[r.category_id] = (categories[r.category_id] || 0) + 1;
        if (r.profile_id)
            profiles[r.profile_id] = (profiles[r.profile_id] || 0) + 1;
        if (r.amount)
            values.push(Number(r.amount));
    });
    return {
        count: history.length,
        categories,
        profiles,
        minAmount: Math.min(...values),
        maxAmount: Math.max(...values),
        avgAmount: values.reduce((a, b) => a + b, 0) / values.length,
        recent: history.slice(0, 5),
    };
}
