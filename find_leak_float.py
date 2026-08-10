import itertools
items = [
    (15.24, "DARF"), (95.56, "ENEL1"), (95.64, "ENEL2"), (98.41, "ENEL3"),
    (204.00, "CONTABIL"), (318.55, "SABESP1"), (409.56, "SABESP2"),
    (526.08, "SABESP3"), (1029.12, "DARF2"), (4766.93, "TARGET"),
    (5646.67, "RAGUNA"), (5769.19, "NAO_ID"), (6612.50, "CONDOMINIO"),
    (27450.60, "LEILOEIRO"), (209700.00, "RUA_JOSE_LINS")
]
target = 25184.74
for r in range(1, len(items) + 1):
    for combo in itertools.combinations(items, r):
        s = sum(x[0] for x in combo)
        if abs(s - target) < 0.01:
            print("ENCONTRADO!")
            for x in combo: print(f"  - {x[1]}: {x[0]}")
            exit()
