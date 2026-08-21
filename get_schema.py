import os
import requests
import json

# Como não temos acesso direto ao PSQL, vamos tentar ler o schema via arquivo gerado ou metadados se disponíveis.
# Mas a melhor forma é listar os arquivos de integração ou tipos.
