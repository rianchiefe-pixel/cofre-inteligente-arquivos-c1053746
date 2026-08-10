import itertools

items = [
    (15.24, "DARF (imposto)"),
    (95.56, "ENEL"),
    (95.64, "ENEL"),
    (98.41, "ENEL"),
    (204.00, "Org contábil itauna ltda"),
    (318.55, "SABESP"),
    (409.56, "SABESP"),
    (526.08, "SABESP"),
    (1029.12, "DARF (imposto)"),
    (4766.93, "TARGET – Gestão de bens e condomínios"),
    (5646.67, "Imóvel Raguna Cabral"),
    (5769.19, "Não identificado"),
    (6612.50, "Condomínio (quando aplicável)"),
    (27450.60, "Comissão de leiloreiro"),
    (209700.00, "Imóvel Rua josé lins")
]

target = 25184.74

for r in range(1, len(items) + 1):
    for combo in itertools.combinations(items, r):
        current_sum = sum(item[0] for item in combo)
        if abs(current_sum - target) < 0.01:
            print(f"Encontrado! Quantidade: {len(combo)}")
            for item in combo:
                print(f"- {item[1]}: {item[0]}")
            exit()
print("Nenhum subconjunto exato encontrado na Holding.")
