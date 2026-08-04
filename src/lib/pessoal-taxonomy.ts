/**
 * Taxonomia oficial para o Perfil Pessoal.
 */
export const PESSOAL_TAXONOMY: { parent: string; children: { name: string; type: "gasto_fixo" | "gasto_variavel" | "pessoal" | "investimento" }[] }[] = [
  {
    parent: "Habitação",
    children: [
      { name: "Aluguel", type: "gasto_fixo" },
      { name: "Condomínio", type: "gasto_fixo" },
      { name: "Energia Elétrica", type: "gasto_variavel" },
      { name: "Água e Esgoto", type: "gasto_variavel" },
      { name: "Internet e TV", type: "gasto_fixo" },
      { name: "Gás", type: "gasto_variavel" },
      { name: "Manutenção da Casa", type: "gasto_variavel" },
      { name: "Limpeza e Produtos", type: "gasto_variavel" },
      { name: "Seguro Residencial", type: "gasto_fixo" },
    ],
  },
  {
    parent: "Alimentação",
    children: [
      { name: "Supermercado", type: "gasto_variavel" },
      { name: "Restaurantes e Bares", type: "gasto_variavel" },
      { name: "Delivery (Ifood/UberEats)", type: "gasto_variavel" },
      { name: "Lanches e Cafés", type: "gasto_variavel" },
    ],
  },
  {
    parent: "Transporte",
    children: [
      { name: "Combustível", type: "gasto_variavel" },
      { name: "Estacionamento e Pedágio", type: "gasto_variavel" },
      { name: "Uber e Apps", type: "gasto_variavel" },
      { name: "Manutenção de Veículos", type: "gasto_variavel" },
      { name: "Seguro de Veículos", type: "gasto_fixo" },
      { name: "IPVA e Licenciamento", type: "gasto_fixo" },
      { name: "Multas de Trânsito", type: "gasto_variavel" },
    ],
  },
  {
    parent: "Saúde e Bem-estar",
    children: [
      { name: "Plano de Saúde", type: "gasto_fixo" },
      { name: "Farmácia", type: "gasto_variavel" },
      { name: "Consultas e Exames", type: "gasto_variavel" },
      { name: "Academia e Esportes", type: "gasto_fixo" },
      { name: "Higiene e Beleza", type: "gasto_variavel" },
      { name: "Terapia", type: "gasto_fixo" },
    ],
  },
  {
    parent: "Educação",
    children: [
      { name: "Escola ou Faculdade", type: "gasto_fixo" },
      { name: "Cursos e Treinamentos", type: "gasto_variavel" },
      { name: "Livros e Materiais", type: "gasto_variavel" },
      { name: "Idiomas", type: "gasto_fixo" },
    ],
  },
  {
    parent: "Lazer e Estilo de Vida",
    children: [
      { name: "Viagens", type: "gasto_variavel" },
      { name: "Cinema e Teatro", type: "gasto_variavel" },
      { name: "Hobbies", type: "gasto_variavel" },
      { name: "Presentes e Doações", type: "gasto_variavel" },
      { name: "Streaming (Netflix/Spotify)", type: "gasto_fixo" },
      { name: "Assinaturas Diversas", type: "gasto_fixo" },
    ],
  },
  {
    parent: "Financeiro e Investimentos",
    children: [
      { name: "Investimentos", type: "investimento" },
      { name: "Reserva de Emergência", type: "investimento" },
      { name: "Previdência Privada", type: "investimento" },
      { name: "Tarifas Bancárias", type: "gasto_variavel" },
      { name: "Juros e Empréstimos", type: "gasto_variavel" },
      { name: "Seguros de Vida", type: "gasto_fixo" },
    ],
  },
  {
    parent: "Impostos e Taxas",
    children: [
      { name: "Imposto de Renda", type: "gasto_variavel" },
      { name: "Taxas Governamentais", type: "gasto_variavel" },
    ],
  },
  {
    parent: "Outros",
    children: [
      { name: "Despesas Diversas", type: "pessoal" },
      { name: "Saques em Dinheiro", type: "pessoal" },
    ],
  },
];
