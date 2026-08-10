import sys

holding_items = []
with open('all_jan_approved.txt', 'r') as f:
    for line in f:
        if 'Holding' in line:
            parts = line.split('|')
            if len(parts) >= 3:
                try:
                    amount = float(parts[1].strip())
                    name = parts[2].strip()
                    rid = parts[3].strip()
                    holding_items.append((amount, name, rid))
                except:
                    continue

target = 25184.74
import itertools

# Tentar encontrar a soma exata
for r in range(1, len(holding_items) + 1):
    for combo in itertools.combinations(holding_items, r):
        current_sum = sum(item[0] for item in combo)
        if abs(current_sum - target) < 0.01:
            print(f"MATCH! Qtd: {len(combo)}")
            for item in combo:
                print(f"{item[2]} | {item[1]} | {item[0]}")
            exit()
print("Nada na Holding soma 25.184,74.")
