items_holding = [
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

pessoal_total = 227844.13
target_old_report = 253028.87
target_leak = target_old_report - pessoal_total

import itertools

for r in range(1, len(items_holding) + 1):
    for combo in itertools.combinations(items_holding, r):
        current_sum = sum(item[0] for item in combo)
        if abs(current_sum - target_leak) < 0.01:
            print(f"VAZAMENTO ENCONTRADO! Quantidade: {len(combo)}")
            for item in combo:
                print(f"- {item[1]}: {item[0]}")
            print(f"Soma: {current_sum}")
            exit()
print("Não foi possível encontrar o subconjunto que resulta no vazamento de 25.184,74.")
