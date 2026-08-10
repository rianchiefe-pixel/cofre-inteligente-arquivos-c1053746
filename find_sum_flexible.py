import itertools

items = [
    (15.24, "DARF (imposto)", "2a43"),
    (95.56, "ENEL", "b945"),
    (95.64, "ENEL", "1241"),
    (98.41, "ENEL", "d787"),
    (204.00, "Org contábil itauna ltda", "6140"),
    (318.55, "SABESP", "4597"),
    (409.56, "SABESP", "8426"),
    (526.08, "SABESP", "3144"),
    (1029.12, "DARF (imposto)", "8107"),
    (4766.93, "TARGET – Gestão de bens e condomínios", "35fc"),
    (5646.67, "Imóvel Raguna Cabral", "53b4"),
    (5769.19, "Não identificado", "7bfa"),
    (6612.50, "Condomínio (quando aplicável)", "8d73"),
    (27450.60, "Comissão de leiloreiro", "9ba1"),
    (209700.00, "Imóvel Rua josé lins", "c57b")
]

target = 25184.74

# Tentar encontrar a soma exata
for r in range(1, len(items) + 1):
    for combo in itertools.combinations(items, r):
        current_sum = sum(item[0] for item in combo)
        if abs(current_sum - target) < 0.01:
            print(f"Encontrado! Quantidade: {len(combo)}")
            for item in combo:
                print(f"- {item[1]} ({item[2]}): {item[0]}")
            exit()

# Se não encontrar exato, tentar ver se há algum item do Pessoal (ex: 402.71) que 'faltava'
# Mas o usuário disse que SUM(amount) da Holding deve ser EXATAMENTE 25.184,74.
print("Nenhum subconjunto exato de Holding Jan soma 25.184,74.")
