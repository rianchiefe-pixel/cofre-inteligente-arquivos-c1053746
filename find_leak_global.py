import itertools
from decimal import Decimal
import os
import subprocess

# Buscar todos os receipts de Janeiro Aprovados
cmd = "psql \"$SUPABASE_DB_URL\" -t -c \"SELECT amount FROM public.receipts WHERE status = 'approved' AND payment_date >= '2026-01-01' AND payment_date <= '2026-01-31'\""
out = subprocess.check_output(cmd, shell=True).decode()
amounts = [Decimal(x.strip()) for x in out.splitlines() if x.strip()]

target = Decimal("25184.74")
# Não dá para testar todas as combinações de 239 itens.
# Mas posso testar combinações dos itens da Holding Jan (15) + alguns do Pessoal?
# Não.
