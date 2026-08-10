import itertools
from decimal import Decimal

items = [
    (Decimal("15.24"), "2a43"), (Decimal("95.56"), "b945"), (Decimal("95.64"), "1241"),
    (Decimal("98.41"), "d787"), (Decimal("204.00"), "6140"), (Decimal("318.55"), "4597"),
    (Decimal("409.56"), "8426"), (Decimal("526.08"), "3144"), (Decimal("1029.12"), "8107"),
    (Decimal("4766.93"), "35fc"), (Decimal("5646.67"), "53b4"), (Decimal("5769.19"), "7bfa"),
    (Decimal("6612.50"), "8d73"), (Decimal("27450.60"), "9ba1"), (Decimal("209700.00"), "c57b")
]
target = Decimal("25184.74")

for r in range(1, len(items) + 1):
    for combo in itertools.combinations(items, r):
        if sum(x[0] for x in combo) == target:
            print(f"ENCONTRADO!")
            for x in combo: print(f"- {x[1]}: {x[0]}")
            exit()
print("Nada.")
