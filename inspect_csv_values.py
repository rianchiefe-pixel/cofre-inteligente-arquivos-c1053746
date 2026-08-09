import csv
csv_path = "/mnt/user-uploads/meu-cofre-maio-junho-2026-categorias-padronizadas.csv"
with open(csv_path, mode='r', encoding='utf-8-sig') as f:
    reader = csv.reader(f, delimiter=';')
    headers = next(reader)
    for i, row in enumerate(reader):
        if i < 5:
            print(f"Linha {i}: {row}")
            # Ver hex do valor
            val = row[1]
            print(f"Hex: {val.encode('utf-8').hex()}")
