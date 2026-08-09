import csv
import json
import os
import requests
from datetime import datetime

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def query_supabase(sql):
    # Usando a API REST do Supabase para rodar queries (via rpc ou endpoint direto se disponível)
    # Como não temos acesso direto ao PSQL via bunx, usaremos o cliente python ou requests
    # Mas o mais seguro para UPDATEs em lote é preparar um script que usa o cliente gerado.
    pass

def parse_monetary(val):
    if not val: return 0
    # "R$ 3.996,00" -> 399600
    val = val.replace("R$", "").replace(".", "").replace(",", "").strip()
    try:
        return int(val)
    except:
        return 0

def parse_date(date_str):
    # "29/06/2026" -> "2026-06-29"
    try:
        return datetime.strptime(date_str, "%d/%m/%Y").strftime("%Y-%m-%d")
    except:
        return date_str

# Carregar o CSV
csv_path = "/mnt/user-uploads/meu-cofre-maio-junho-2026-categorias-padronizadas.csv"
rows_to_update = []
with open(csv_path, mode='r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f, delimiter=';')
    for row in reader:
        rows_to_update.append({
            "date": parse_date(row["Data"]),
            "amount": parse_monetary(row["Valor"]),
            "recipient": row["Destinatário"],
            "category": row["Categoria"],
            "auth_code": row.get("Autenticação", ""),
            "profile_name": row["Perfil"]
        })

print(f"Lidos {len(rows_to_update)} registros do CSV.")
# Exemplo do teste Arbos
arbos = [r for r in rows_to_update if "ARBOS" in r["recipient"] and r["date"] == "2026-06-29"]
print(f"Teste Arbos no CSV: {arbos}")
