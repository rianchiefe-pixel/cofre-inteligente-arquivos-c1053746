import itertools
from decimal import Decimal
items = [
    (Decimal("15.24"), "DARF"), (Decimal("95.56"), "ENEL1"), (Decimal("95.64"), "ENEL2"),
    (Decimal("98.41"), "ENEL3"), (Decimal("204.00"), "CONTABIL"), (Decimal("318.55"), "SABESP1"),
    (Decimal("409.56"), "SABESP2"), (Decimal("526.08"), "SABESP3"), (Decimal("1029.12"), "DARF2"),
    (Decimal("4766.93"), "TARGET"), (Decimal("5646.67"), "RAGUNA"), (Decimal("5769.19"), "NAO_ID"),
    (Decimal("6612.50"), "CONDOMINIO")
]
target = Decimal("25184.74")
for r in range(1, len(items) + 1):
    for combo in itertools.combinations(items, r):
        if sum(x[0] for x in combo) == target:
            print("ENCONTRADO!")
            for x in combo: print(f"  - {x[1]}: {x[0]}")
            exit()
