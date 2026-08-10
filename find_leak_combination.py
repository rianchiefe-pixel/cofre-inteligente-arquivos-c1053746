import itertools
from decimal import Decimal
items = [
    Decimal("15.24"), Decimal("95.56"), Decimal("95.64"), Decimal("98.41"),
    Decimal("204.00"), Decimal("318.55"), Decimal("409.56"), Decimal("526.08"),
    Decimal("1029.12"), Decimal("4766.93"), Decimal("5646.67"), Decimal("5769.19"),
    Decimal("6612.50"), Decimal("27450.60"), Decimal("209700.00")
]
target = Decimal("25184.74")
# Testar todas as combinações de 1 a 15 itens
for r in range(1, 16):
    for combo in itertools.combinations(items, r):
        if sum(combo) == target:
            print(f"Match: {combo}")
            exit()
print("Sem match exato.")
